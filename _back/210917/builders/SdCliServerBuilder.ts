import { EventEmitter } from "events";
import { INpmConfig, ISdPackageBuildResult, ISdServerPackageConfig, ITsconfig } from "../commons";
import * as ts from "typescript";
import { FsUtil, Logger, PathUtil } from "@simplysm/sd-core-node";
import { ObjectUtil, StringUtil, Wait } from "@simplysm/sd-core-common";
import * as webpack from "webpack";
import * as path from "path";
import { JavaScriptOptimizerPlugin } from "@angular-devkit/build-angular/src/webpack/plugins/javascript-optimizer-plugin";
import { DedupeModuleResolvePlugin } from "@angular-devkit/build-angular/src/webpack/plugins";
import { LicenseWebpackPlugin } from "license-webpack-plugin";
import { SdWebpackUtil } from "../utils/SdWebpackUtil";
import { ErrorInfo } from "ts-loader/dist/interfaces";
import { LintResult } from "eslint-webpack-plugin/declarations/options";
import * as os from "os";
import { SdServiceServer } from "@simplysm/sd-service-node";
import decache from "decache";
import * as CopyWebpackPlugin from "copy-webpack-plugin";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ESLintWebpackPlugin = require("eslint-webpack-plugin");

export class SdCliServerBuilder extends EventEmitter {
  public parsedTsconfig: ts.ParsedCommandLine;
  public npmConfigCache = new Map<string, INpmConfig>();
  private _server?: SdServiceServer;

  public constructor(public rootPath: string,
                     public tsconfigFilePath: string,
                     public projectRootPath: string,
                     public config: ISdServerPackageConfig) {
    super();

    const tsconfig: ITsconfig = FsUtil.readJson(this.tsconfigFilePath);
    this.parsedTsconfig = ts.parseJsonConfigFileContent(tsconfig, ts.sys, this.rootPath);
    this.npmConfigCache.set(this.rootPath, FsUtil.readJson(path.resolve(this.rootPath, "package.json")));
  }

  public on(event: "change", listener: () => void): this;
  public on(event: "complete", listener: (results: ISdPackageBuildResult[], server?: SdServiceServer) => void): this;
  public on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  public async buildAsync(): Promise<void> {
    this.emit("change");

    await FsUtil.removeAsync(this.parsedTsconfig.options.outDir!);

    const externalModuleNames = this._findExternalModuleNames(false);

    // ??????

    const webpackConfig = this._getWebpackConfig(false, externalModuleNames);
    const compiler = webpack(webpackConfig);
    const buildResults = await new Promise<ISdPackageBuildResult[]>((resolve, reject) => {
      compiler.run((err, stat) => {
        if (err != null) {
          reject(err);
          return;
        }

        // ?????? ??????

        const results = SdWebpackUtil.getWebpackResults(stat!);
        resolve(results);
      });
    });

    // .config.json ?????? ??????

    const targetPath = path.resolve(this.parsedTsconfig.options.outDir!, ".config.json");
    await FsUtil.writeFileAsync(targetPath, JSON.stringify(this.config.configs ?? {}, undefined, 2));

    // pm2.json ?????? ??????
    if (this.config.pm2 !== undefined && this.config.pm2 !== false) {
      const npmConfig = this._getNpmConfig(this.rootPath)!;
      const pm2DistPath = path.resolve(this.parsedTsconfig.options.outDir!, "pm2.json");
      await FsUtil.writeFileAsync(pm2DistPath, JSON.stringify(ObjectUtil.merge(
        {
          "name": npmConfig.name.replace(/@/g, "").replace(/\//g, "-"),
          "script": path.basename(path.resolve(this.parsedTsconfig.options.outDir!, "main.js")),
          "watch": true,
          "watch_delay": 2000,
          "ignore_watch": [
            "node_modules",
            "www"
          ].distinct(),
          "interpreter": "node@" + process.versions.node,
          "env": {
            NODE_ENV: "production",
            VERSION: npmConfig.version,
            TZ: "Asia/Seoul",
            ...this.config.env ? this.config.env : {}
          }
        },
        (typeof this.config.pm2 !== "boolean") ? this.config.pm2 : {}
      ), undefined, 2));
    }

    // iis ?????? ??????
    if (this.config.iis) {
      const iisDistPath = path.resolve(this.parsedTsconfig.options.outDir!, "web.config");
      await FsUtil.writeFileAsync(iisDistPath, `
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <handlers>
      <add name="iisnode" path="main.js" verb="*" modules="iisnode" />
    </handlers>
    <iisnode nodeProcessCommandLine="C:\\Program Files\\nodejs\\node.exe" watchedFiles="web.config;*.js" loggingEnabled="true" />
    <rewrite>
      <rules>
        <rule name="main">
          <action type="Rewrite" url="main.js" />
        </rule>
      </rules>
    </rewrite>
    <httpErrors errorMode="Detailed" />  
  </system.webServer>
</configuration>
`.trim());
    }

    // ????????? package.json ?????? ??????

    const distNpmConfig = ObjectUtil.clone(this._getNpmConfig(this.rootPath))!;
    distNpmConfig.dependencies = {};
    for (const externalModuleName of externalModuleNames) {
      distNpmConfig.dependencies[externalModuleName] = "*";
    }
    delete distNpmConfig.devDependencies;
    delete distNpmConfig.peerDependencies;

    await FsUtil.writeFileAsync(path.resolve(this.parsedTsconfig.options.outDir!, "package.json"), JSON.stringify(distNpmConfig, undefined, 2));

    // CopyWebpackPlugin ?????? ?????? ??????

    for (const item of ["assets/"]) {
      await FsUtil.copyAsync(path.resolve(this.rootPath, "src", item), path.resolve(this.parsedTsconfig.options.outDir!, item));
    }

    this.emit("complete", buildResults);
  }

  public async watchAsync(): Promise<void> {
    await FsUtil.removeAsync(this.parsedTsconfig.options.outDir!);

    const externalModuleNames = this._findExternalModuleNames(true);

    // ??????

    const webpackConfig = this._getWebpackConfig(true, externalModuleNames);
    const compiler = webpack(webpackConfig);
    await new Promise<void>((resolve, reject) => {
      compiler.hooks.watchRun.tapAsync(this.constructor.name, async (args, callback) => {
        this.emit("change");
        callback();

        await this._stopServerAsync();
      });

      compiler.watch({ poll: undefined }, async (err, stat) => {
        if (err != null) {
          reject(err);
          return;
        }

        // .config.json ?????? ??????

        const configDistPath = path.resolve(this.parsedTsconfig.options.outDir!, ".config.json");
        await FsUtil.writeFileAsync(configDistPath, JSON.stringify(this.config.configs ?? {}, undefined, 2));

        // ?????? ??????

        const results = SdWebpackUtil.getWebpackResults(stat!);

        // ?????? ??????
        try {
          await this._startServerAsync();
        }
        catch (error) {
          results.push({
            filePath: undefined,
            severity: "error",
            message: error.message
          });
        }

        // ?????? ??????

        this.emit("complete", results, this._server);
        resolve();
      });
    });
  }

  private async _stopServerAsync(): Promise<void> {
    if (this._server) {
      await this._server.closeAsync();
      delete this._server;
    }
    const mainFilePath = path.resolve(this.parsedTsconfig.options.outDir!, "main.js");
    decache(mainFilePath);
  }

  private async _startServerAsync(): Promise<void> {
    await Wait.true(() => this._server === undefined);


    const mainFilePath = path.resolve(this.parsedTsconfig.options.outDir!, "main.js");

    const prevLoggerConfigs = ObjectUtil.clone(Logger.configs);
    this._server = require(mainFilePath) as SdServiceServer | undefined;
    Logger.configs = prevLoggerConfigs;

    if (!this._server) {
      throw new Error(`${mainFilePath}(0, 0): 'SdServiceServer'??? 'export'?????? ?????????.`);
    }


    await new Promise<void>((resolve) => {
      this._server!.on("ready", () => {
        resolve();
      });
    });
  }

  private _getWebpackConfig(watch: boolean, externalModuleNames: string[]): webpack.Configuration {
    return {
      mode: watch ? "development" : "production",
      devtool: false,
      target: ["node", "es2020"],
      profile: false,
      resolve: {
        extensions: [".ts", ".tsx", ".js"],
        symlinks: true,
        modules: [this.projectRootPath, "node_modules"],
        mainFields: ["es2020", "main", "module"]
      },
      resolveLoader: {
        symlinks: true,
        modules: [
          "node_modules",
          ...this._findAllNodeModules(__dirname, this.projectRootPath)
        ]
      },
      context: this.projectRootPath,
      entry: {
        main: [
          // TODO: "source-map-support/register"??
          path.resolve(this.rootPath, "src/main.ts")
        ]
      },
      output: {
        clean: true,
        path: this.parsedTsconfig.options.outDir,
        // filename: watch ? "[name].js" : `[name].[chunkhash:20].js`,
        // chunkFilename: watch ? "[name].js" : "[name].[chunkhash:20].js",
        filename: "[name].js",
        chunkFilename: "[name].js",
        libraryTarget: watch ? "umd" : "commonjs"
      },
      performance: { hints: false },
      module: {
        strictExportPresence: true,
        rules: [
          ...watch ? [
            {
              test: /\.js$/,
              enforce: "pre",
              loader: require.resolve("source-map-loader"),
              options: {
                filterSourceMappingUrl: (mapUri: string, resourcePath: string) => {
                  return !resourcePath.includes("node_modules");
                }
              }
            }
          ] as any : [],
          {
            test: /\.ts$/,
            exclude: /node_modules/,
            loader: require.resolve("ts-loader"),
            options: {
              configFile: this.tsconfigFilePath,
              errorFormatter: (msg: ErrorInfo, colors: boolean) => {
                return `${msg.file}(${msg.line}, ${msg.character}): ${msg.code}: ${msg.severity} ${msg.content}`;
              }
            }
          }
        ]
      },
      cache: watch ? { type: "memory", maxGenerations: 1 } : false,
      optimization: {
        minimizer: watch ? [] : [
          new JavaScriptOptimizerPlugin({
            sourcemap: false,
            target: this.parsedTsconfig.options.target,
            keepNames: true,
            removeLicenses: true,
            advanced: true
          }) as any
        ],
        moduleIds: "deterministic",
        chunkIds: watch ? "named" : "deterministic",
        emitOnErrors: false
      },
      plugins: [
        new DedupeModuleResolvePlugin({ verbose: false }) as any,
        ...watch ? [] : [
          new LicenseWebpackPlugin({
            stats: { warnings: false, errors: false },
            perChunkOutput: false,
            outputFilename: "3rdpartylicenses.txt",
            skipChildCompilers: true
          })
        ],
        ...watch ? [
          new CopyWebpackPlugin({
            patterns: ["assets/"].map((item) => ({
              context: this.rootPath,
              to: item,
              from: `src/${item}`,
              noErrorOnMissing: true,
              force: true,
              globOptions: {
                dot: true,
                followSymbolicLinks: false,
                ignore: [
                  ".gitkeep",
                  "**/.DS_Store",
                  "**/Thumbs.db"
                ].map((i) => PathUtil.posix(this.rootPath, i))
              },
              priority: 0
            }))
          })
        ] : [],
        ...this.config.env ? [
          new webpack.EnvironmentPlugin(this.config.env)
        ] : [],
        new ESLintWebpackPlugin({
          context: this.rootPath,
          eslintPath: path.resolve(this.projectRootPath, "node_modules", "eslint"),
          extensions: ["js", "ts"],
          exclude: ["node_modules"],
          fix: false,
          threads: true,
          formatter: (results: LintResult[]) => {
            const resultMessages: string[] = [];
            for (const result of results) {
              for (const msg of result.messages) {
                resultMessages.push(`${result.filePath}(${msg.line}, ${msg.column}): ${msg.ruleId ?? ""}: ${msg.severity === 1 ? "warning" : msg.severity === 2 ? "error" : ""} ${msg.message}`);
              }
            }
            return resultMessages.join(os.EOL);
          }
        })
      ],
      node: false,
      externals: [
        ...externalModuleNames,
        ...this.config.externalDependencies ? this.config.externalDependencies : []
      ].distinct(),
      stats: "errors-warnings"
    };
  }

  private _findAllNodeModules(from: string, root: string): string[] {
    const nodeModules: string[] = [];

    let current = from;
    while (current) {
      const potential = path.join(current, "node_modules");
      if (FsUtil.exists(potential) && FsUtil.isDirectory(potential)) {
        nodeModules.push(potential);
      }

      if (current === root) break;

      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }

    return nodeModules;
  }

  private _findModulePath(moduleName: string, currentPath: string): string | undefined {
    const nodeModulesPaths = this._findAllNodeModules(currentPath, this.projectRootPath);

    for (const nodeModulePath of nodeModulesPaths) {
      const potential = path.join(nodeModulePath, moduleName);
      if (FsUtil.exists(potential)) {
        return potential;
      }
    }

    return undefined;
  }

  private _findExternalModuleNames(all: boolean): string[] {
    const loadedModuleNames: string[] = [];
    const externalModuleNames: string[] = [];

    const fn = (rootPath: string): void => {
      const npmConfig = this._getNpmConfig(rootPath);
      if (!npmConfig) return;

      for (const moduleName of Object.keys(npmConfig.dependencies ?? {})) {
        if (loadedModuleNames.includes(moduleName)) continue;
        loadedModuleNames.push(moduleName);

        if (this.config.externalDependencies?.includes(moduleName)) {
          externalModuleNames.push(moduleName);
        }

        const modulePath = this._findModulePath(moduleName, rootPath);
        if (StringUtil.isNullOrEmpty(modulePath)) continue;

        if (all || FsUtil.exists(path.resolve(modulePath, "binding.gyp"))) {
          externalModuleNames.push(moduleName);
        }

        fn(modulePath);
      }
    };

    fn(this.rootPath);

    return externalModuleNames.distinct();
  }

  private _getNpmConfig(rootPath: string): INpmConfig | undefined {
    if (!this.npmConfigCache.has(rootPath)) {
      this.npmConfigCache.set(rootPath, FsUtil.readJson(path.resolve(rootPath, "package.json")));
    }
    return this.npmConfigCache.get(rootPath);
  }
}
