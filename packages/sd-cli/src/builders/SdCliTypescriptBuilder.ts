import * as ts from "typescript";
import { INpmConfig, ISdAutoIndexConfig, ISdPackageBuildResult, ITsconfig } from "../commons";
import { FsUtil, Logger, PathUtil, SdFsWatcher } from "@simplysm/sd-core-node";
import { NeverEntryError } from "@simplysm/sd-core-common";
import { EventEmitter } from "events";
import * as path from "path";
import { SdTsDiagnosticUtil } from "../utils/SdTsDiagnosticUtil";
import { ESLint, Linter } from "eslint";
import { createHash } from "crypto";
import { SdCliIndexFileGenerator } from "../build-tools/SdCliIndexFileGenerator";
import ParserOptions = Linter.ParserOptions;

export class SdCliTypescriptBuilder extends EventEmitter {
  protected readonly _logger: Logger;

  protected _tsconfig: ITsconfig;
  public readonly npmConfig: INpmConfig;

  protected _moduleResolutionCache?: ts.ModuleResolutionCache;
  protected _cacheCompilerHost?: ts.CompilerHost;
  protected _program?: ts.Program;
  protected _builder?: ts.BuilderProgram | ts.SemanticDiagnosticsBuilderProgram;
  protected readonly _fileCache = new Map<string, ITsBuildFileCache>();

  private readonly _indexFileGenerator?: SdCliIndexFileGenerator;

  private _watcher?: SdFsWatcher;

  public skipProcesses: string[];

  public constructor(public rootPath: string,
                     public tsconfigFilePath: string,
                     skipProcesses: ("emit" | "check" | "lint" | "genIndex")[],
                     public autoIndexConfig: ISdAutoIndexConfig | undefined) {
    super();
    this.skipProcesses = skipProcesses;

    this._tsconfig = FsUtil.readJson(this.tsconfigFilePath);

    this.npmConfig = FsUtil.readJson(path.resolve(this.rootPath, "package.json"));
    this._logger = Logger.get(["simplysm", "sd-cli", this.constructor.name, this.npmConfig.name]);

    if (this.autoIndexConfig) {
      this._indexFileGenerator = new SdCliIndexFileGenerator(this.rootPath, this.autoIndexConfig);
    }
  }

  public on(event: "change", listener: () => void): this;
  public on(event: "complete", listener: (results: ISdPackageBuildResult[]) => void): this;
  public on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  public async buildAsync(watch: boolean): Promise<void> {
    this.emit("change");

    const parsedTsconfig = ts.parseJsonConfigFileContent(this._tsconfig, ts.sys, this.rootPath);

    // DIST ?????????
    await FsUtil.removeAsync(parsedTsconfig.options.outDir!);
    if (parsedTsconfig.options.declarationDir !== undefined) {
      await FsUtil.removeAsync(parsedTsconfig.options.declarationDir);
    }

    // ???????????? ?????????
    const buildResult: ISdPackageBuildResult[] = [];
    const reloadProgramResult = await this.reloadProgramAsync(watch);
    buildResult.push(...reloadProgramResult.result);

    // ??????????????? ??????????????? ?????? ??? ????????? (index.ts???)
    const buildGenAdditionalResult = await this.generateAdditionalFilesAsync(reloadProgramResult.dirtyFilePaths, watch);
    buildResult.push(...buildGenAdditionalResult.result);
    reloadProgramResult.dirtyFilePaths.push(...buildGenAdditionalResult.dirtyFilePaths);

    // ?????????, ?????? ???????????? ??????
    if (!watch) {
      const buildDoAllResults = await this.doAllAsync(reloadProgramResult.dirtyFilePaths.distinct());
      buildResult.push(...buildDoAllResults);
      this.emit("complete", buildResult.distinct());
      return;
    }

    // ???????????????, ??????????????? ??????
    const resultMap = new Map<string, ISdPackageBuildResult[]>();

    const watchPaths = this.getWatchPaths();
    this._watcher = new SdFsWatcher();
    this._watcher
      .onChange(async (changeInfos) => {
        try {
          // ???????????? ???, ????????? ?????? ??????
          const changedFilePaths = changeInfos
            .map((item) => PathUtil.posix(item.filePath))
            .filter((item) => path.basename(item).includes("."))
            .distinct();
          if (changedFilePaths.length === 0) return;

          // ???????????? ????????? ??????
          this.emit("change");

          // ??????????????? ?????? ???????????? ?????????
          const reloadChangedProgramResult = await this.reloadChangedProgramAsync(changedFilePaths, watch);
          const watchDirtyFilePaths = reloadChangedProgramResult.dirtyFilePaths;
          if (watchDirtyFilePaths.length === 0) {
            this.emit("complete", Array.from(resultMap.values()).mapMany());
            return;
          }

          // ??????????????? ?????? ??????????????? ??????????????? ?????? ??? ????????? (index.ts???)
          const watchGenAdditionalResult = await this.generateAdditionalFilesAsync([...changedFilePaths, ...watchDirtyFilePaths], watch);
          watchDirtyFilePaths.push(...watchGenAdditionalResult.dirtyFilePaths);
          watchDirtyFilePaths.distinctThis();

          // ??????????????? ?????? ?????? ??? ??????
          const watchDoAllResults = await this.doAllAsync(watchDirtyFilePaths);

          // ?????? MAP?????? DIRTY FILE ??????
          resultMap.delete("undefined");
          for (const dirtyFilePath of watchDirtyFilePaths) {
            resultMap.delete(dirtyFilePath);
          }

          // ?????? MAP ??????
          const result = [...reloadChangedProgramResult.result, ...watchGenAdditionalResult.result, ...watchDoAllResults].distinct();
          for (const resultItem of result) {
            const posixFilePath = resultItem.filePath !== undefined ? PathUtil.posix(resultItem.filePath) : "undefined";
            const resultMapValue = resultMap.getOrCreate(posixFilePath, []);
            resultMapValue.push(resultItem);
          }

          this.emit("complete", Array.from(resultMap.values()).mapMany());
        }
        catch (err) {
          if (err instanceof Error) {
            this.emit("complete", [{
              filePath: undefined,
              severity: "error",
              message: err.stack ?? err.message
            }]);
          }
          else {
            throw err;
          }
        }
      })
      .watch(watchPaths);

    // ???????????????, ?????? ??????

    // ?????? ??? ??????
    const buildDoAllResults = await this.doAllAsync(reloadProgramResult.dirtyFilePaths.distinct());
    buildResult.push(...buildDoAllResults);

    // ?????? MAP ??????
    buildResult.distinctThis();
    for (const buildResultItem of buildResult) {
      const posixFilePath = buildResultItem.filePath !== undefined ? PathUtil.posix(buildResultItem.filePath) : "undefined";
      const resultMapValue = resultMap.getOrCreate(posixFilePath, []);
      resultMapValue.push(buildResultItem);
      resultMapValue.distinctThis();
    }
    this.emit("complete", Array.from(resultMap.values()).mapMany());
  }

  public async generateAdditionalFilesAsync(dirtyFilePaths: string[], watch: boolean): Promise<ITsGenResult> {
    return await this._generateIndexFileAsync(watch);
  }

  protected async _generateIndexFileAsync(watch: boolean): Promise<ITsGenResult> {
    this._logger.debug("index.ts ??????");

    const result: ITsGenResult = { dirtyFilePaths: [], result: [] };

    if (!this.skipProcesses.includes("genIndex") && this._indexFileGenerator && this.autoIndexConfig) {
      const generateResult = await this._indexFileGenerator.generateAsync();
      result.result.push(...generateResult.result);
      if (generateResult.changed) {
        const reloadChangedProgramResult = await this.reloadChangedProgramAsync([this._indexFileGenerator.indexFilePath], watch);
        result.dirtyFilePaths = reloadChangedProgramResult.dirtyFilePaths;
        result.result.push(...reloadChangedProgramResult.result);
      }
    }

    this._logger.debug("index.ts ?????? ??????", result);

    return result;
  }

  protected _reloadWatchPaths(): void {
    if (this._watcher) {
      this._watcher.replaceWatchPaths(this.getWatchPaths());
    }
  }

  public async doAllAsync(dirtyFilePaths: string[]): Promise<ISdPackageBuildResult[]> {
    return (
      await Promise.all([
        this._runProgramAsync(dirtyFilePaths),
        this._lintAsync(dirtyFilePaths)
      ])
    ).mapMany();
  }

  protected async _lintAsync(dirtyFilePaths: string[]): Promise<ISdPackageBuildResult[]> {
    if (!this.skipProcesses.includes("lint")) {
      this._logger.debug("LINT");

      const linter = new ESLint({
        overrideConfig: {
          overrides: [
            {
              files: ["*.ts"],
              parserOptions: {
                program: this._program
              } as ParserOptions,
              settings: {
                "import/resolver": {
                  typescript: {
                    project: this.tsconfigFilePath
                  }
                }
              }
            }
          ]
        }
      });

      const filePaths = await dirtyFilePaths
        .filterAsync(async (item) => (
          !item.includes("node_modules")
          && PathUtil.isChildPath(item, this.rootPath)
          && FsUtil.exists(item)
          && !FsUtil.isDirectory(item)
          && Boolean(this._program?.getSourceFiles().some((item1) => PathUtil.posix(item1.fileName) === PathUtil.posix(item)))
          && !await linter.isPathIgnored(item)
        ));

      const lintResults = await linter.lintFiles(filePaths);

      const result = lintResults.mapMany((report) => (
        report.messages.map((msg) => {
          const severity: "warning" | "error" = msg.severity === 1 ? "warning" : "error";

          return {
            type: "lint",
            filePath: report.filePath,
            severity,
            message: `${report.filePath}(${msg.line}, ${msg.column}): ${msg.ruleId ?? ""}: ${severity} ${msg.message}`
          };
        })
      ));

      this._logger.debug("LINT ??????", result);

      return result;
    }

    return [];
  }

  /*protected _getAllDependencies(filePath: string): string[] {
    this._logger.debug("?????? ????????? ??????", filePath);

    const sourceFile = this._builder!.getSourceFile(filePath);
    if (!sourceFile) {
      this._logger.debug("?????? ????????? ?????? ??????", []);
      return [];
    }
    const result = [...this._builder!.getAllDependencies(sourceFile)];

    this._logger.debug("?????? ????????? ?????? ??????", result);
    return result;
  }*/

  public getWatchPaths(): string[] {
    // const builder = this._builder as ts.SemanticDiagnosticsBuilderProgram;

    const result: string[] = [];
    for (const sourceFile of this._builder!.getSourceFiles()) {
      // result.push(sourceFile.fileName, ...this._getAllDependencies(sourceFile.fileName));
      result.push(sourceFile.fileName);
    }
    return result.map((item) => PathUtil.posix(path.dirname(item))).filter((item) => FsUtil.exists(item)).distinct();
  }

  /*protected _getRelativeFilePaths(filePath: string): string[] {
    const builder = this._builder as ts.EmitAndSemanticDiagnosticsBuilderProgram;

    const result: string[] = [];
    for (const sourceFile of builder.getSourceFiles()) {
      const dependencies = this._getAllDependencies(sourceFile.fileName);
      if (dependencies.includes(filePath)) {
        result.push(sourceFile.fileName);
      }
    }

    return result;
  }*/

  protected _deleteFileCaches(filePaths: string[]): void {
    for (const filePath of filePaths) {
      this._fileCache.delete(filePath);
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async _runProgramAsync(dirtyFilePaths: string[]): Promise<ISdPackageBuildResult[]> {
    this._logger.debug("??????");

    if (!this._builder) throw new NeverEntryError();

    const diagnostics: ts.Diagnostic[] = [];

    if (!this.skipProcesses.includes("check")) {
      diagnostics.push(
        ...this._builder.getOptionsDiagnostics(),
        ...this._builder.getGlobalDiagnostics()
      );

      for (const sourceFile of this._builder.getSourceFiles()) {
        /*for (const dirtyFilePath of dirtyFilePaths) {
          const sourceFile = this._builder.getSourceFile(dirtyFilePath);
          if (!sourceFile) continue;*/

        if (sourceFile.isDeclarationFile) continue;

        diagnostics.push(
          ...this._builder.getSyntacticDiagnostics(sourceFile),
          ...this._builder.getSemanticDiagnostics(sourceFile)
        );
      }
    }

    if (!this.skipProcesses.includes("emit")) {
      for (const dirtyFilePath of dirtyFilePaths) {
        const sourceFile = this._builder.getSourceFile(dirtyFilePath);
        if (!sourceFile) continue;
        if (sourceFile.isDeclarationFile) continue;

        this._builder.emit(sourceFile);
      }
    }

    const result = diagnostics.map((item) => SdTsDiagnosticUtil.convertDiagnosticsToResult(item)).filterExists();

    this._logger.debug("??????", result);

    return result;
  }

  public async reloadChangedProgramAsync(changedFilePaths: string[], watch: boolean): Promise<{ dirtyFilePaths: string[]; result: ISdPackageBuildResult[] }> {
    this._logger.debug("?????? ???????????? ?????????", changedFilePaths);

    // ?????? ??????
    // const delCachePaths = changedFilePaths.mapMany((item) => [item, ...this._getRelativeFilePaths(item)]).distinct();
    // this._deleteFileCaches(delCachePaths);
    this._deleteFileCaches(changedFilePaths);

    // ???????????? ?????????
    const reloadProgramResult = await this.reloadProgramAsync(watch);

    // ???????????? ?????? ??????, ?????????????????????, ???????????? ?????? ?????????
    if (reloadProgramResult.dirtyFilePaths.length > 0 && watch) {
      this._reloadWatchPaths();
    }

    /*dirtyFilePaths.push(...changedFilePaths.filter((key) => this._fileCache.has(key)));
    dirtyFilePaths.distinctThis();*/

    this._logger.debug("?????? ???????????? ????????? ??????", reloadProgramResult.dirtyFilePaths);
    return reloadProgramResult;
  }

  public getParsedTsconfig(): ts.ParsedCommandLine {
    return ts.parseJsonConfigFileContent(this._tsconfig, ts.sys, this.rootPath);
  }

  public configProgram(parsedTsconfig: ts.ParsedCommandLine): void {
    this._program = ts.createProgram(
      parsedTsconfig.fileNames,
      parsedTsconfig.options,
      this._cacheCompilerHost,
      this._program
    );
  }

  public getSemanticDiagnosticsOfNextAffectedFiles(): string[] | undefined {
    const builder = this._builder as ts.SemanticDiagnosticsBuilderProgram;
    const result = builder.getSemanticDiagnosticsOfNextAffectedFile();

    if (result && "fileName" in result.affected) {
      return [result.affected.fileName];
    }
    if (!result) {
      return undefined;
    }

    return [];
  }

  public async reloadProgramAsync(watch: boolean): Promise<{ dirtyFilePaths: string[]; result: ISdPackageBuildResult[] }> {
    this._logger.debug("???????????? ?????????");

    const parsedTsconfig = this.getParsedTsconfig();

    this._moduleResolutionCache = ts.createModuleResolutionCache(this.rootPath, (s) => s, parsedTsconfig.options);
    this._cacheCompilerHost = await this._createCacheCompilerHostAsync(parsedTsconfig, this._moduleResolutionCache);

    this.configProgram(parsedTsconfig);

    const baseGetSourceFiles = this._program!.getSourceFiles;
    this._program!.getSourceFiles = function (...parameters) {
      const files: readonly (ts.SourceFile & { version?: string })[] = baseGetSourceFiles(...parameters);

      for (const file of files) {
        if (file.version === undefined) {
          file.version = createHash("sha256").update(file.text).digest("hex");
        }
      }

      return files;
    };

    if (watch) {
      if (this.skipProcesses.includes("emit")) {
        this._builder = ts.createSemanticDiagnosticsBuilderProgram(
          this._program!,
          this._cacheCompilerHost,
          this._builder as ts.SemanticDiagnosticsBuilderProgram
        );
      }
      else {
        this._builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
          this._program!,
          this._cacheCompilerHost,
          this._builder as ts.EmitAndSemanticDiagnosticsBuilderProgram
        );
      }

      const buildResults: ISdPackageBuildResult[] = [];
      let seq = 0;
      const affectedFilePathSet = new Set<string>();
      while (true) {
        if (process.env.SD_CLI_LOGGER_SEVERITY === "DEBUG") {
          this._logger.debug(`???????????? ????????? > ???????????? ????????????: [SEQ: ${++seq}]`);
        }

        const affectedFilePaths = this.getSemanticDiagnosticsOfNextAffectedFiles();

        if (affectedFilePaths) {
          if (affectedFilePaths.length > 0) {
            affectedFilePathSet.adds(...affectedFilePaths.distinct());
          }

          if (process.env.SD_CLI_LOGGER_SEVERITY === "DEBUG") {
            this._logger.debug(`???????????? ????????? > ???????????? ????????????: [SEQ: ${seq}, SIZE:${affectedFilePathSet.size}]\n` + affectedFilePaths.map((item) => "- " + item).join("\n"));
          }
        }
        else {
          break;
        }
      }

      const dirtyFilePaths = Array.from(affectedFilePathSet.values());

      this._logger.debug("???????????? ????????? ??????", dirtyFilePaths);

      return { dirtyFilePaths, result: buildResults };
    }
    else {
      this._builder = ts.createAbstractBuilder(this._program!, this._cacheCompilerHost);
      const dirtyFilePaths = this._builder.getSourceFiles().map((item) => item.fileName).distinct();

      this._logger.debug("???????????? ????????? ??????", dirtyFilePaths);

      return { dirtyFilePaths, result: [] };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async _createCacheCompilerHostAsync(parsedTsconfig: ts.ParsedCommandLine, moduleResolutionCache: ts.ModuleResolutionCache): Promise<ts.CompilerHost> {
    const compilerHost = ts.createIncrementalCompilerHost(parsedTsconfig.options);

    const cacheCompilerHost = { ...compilerHost };
    cacheCompilerHost.fileExists = (fileName: string) => {
      const cache = this._fileCache.getOrCreate(PathUtil.posix(fileName), {});
      if (cache.exists === undefined) {
        cache.exists = compilerHost.fileExists.call(cacheCompilerHost, fileName);
      }
      return cache.exists;
    };

    cacheCompilerHost.getSourceFile = (fileName: string, languageVersion: ts.ScriptTarget) => {
      const cache = this._fileCache.getOrCreate(PathUtil.posix(fileName), {});
      if (!cache.sourceFile) {
        cache.sourceFile = compilerHost.getSourceFile.call(cacheCompilerHost, fileName, languageVersion);
      }
      return cache.sourceFile;
    };

    cacheCompilerHost.writeFile = (fileName: string,
                                   data: string,
                                   writeByteOrderMark: boolean,
                                   onError?: (message: string) => void,
                                   sourceFiles?: readonly ts.SourceFile[]) => {
      if (sourceFiles) {
        sourceFiles.forEach((source) => {
          const cache = this._fileCache.getOrCreate(PathUtil.posix(source.fileName), {});
          cache.distFilePaths = (cache.distFilePaths ?? []).concat([PathUtil.posix(fileName)]).distinct();
        });
      }

      if (!FsUtil.exists(fileName) || FsUtil.readFile(fileName) !== data) {
        compilerHost.writeFile.call(cacheCompilerHost, fileName, data, writeByteOrderMark, onError, sourceFiles);
      }
    };

    cacheCompilerHost.readFile = (fileName: string) => {
      const cache = this._fileCache.getOrCreate(PathUtil.posix(fileName), {});
      if (cache.content === undefined) {
        cache.content = compilerHost.readFile.call(cacheCompilerHost, fileName);
      }
      return cache.content;
    };

    cacheCompilerHost.resolveModuleNames = (moduleNames: string[], containingFile: string) => {
      return moduleNames.map((moduleName) => {
        return ts.resolveModuleName(
          moduleName,
          containingFile,
          parsedTsconfig.options,
          compilerHost,
          moduleResolutionCache
        ).resolvedModule;
      });
    };

    return cacheCompilerHost;
  }
}

export interface ITsBuildFileCache {
  exists?: boolean;
  sourceFile?: ts.SourceFile;
  distFilePaths?: string[];
  content?: string;
}

export interface ITsGenResult {
  dirtyFilePaths: string[];
  result: ISdPackageBuildResult[];
}
