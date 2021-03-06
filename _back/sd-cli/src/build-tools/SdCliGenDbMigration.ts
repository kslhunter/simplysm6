import { SdProjectConfigUtil } from "../utils/SdProjectConfigUtil";
import { FsUtil, Logger } from "@simplysm/sd-core-node";
import { SdCliPathUtil } from "../utils/SdCliPathUtil";
import { INpmConfig, ITsConfig } from "../commons";
import * as path from "path";
import { DateTime, JsonConvert, NeverEntryError, NumberUtil, ObjectUtil, Type } from "@simplysm/sd-core-common";
import { SdOrm } from "@simplysm/sd-orm-node";
import { DbContext, DbDefinitionUtil, IDbConnectionConfig, TQueryDef } from "@simplysm/sd-orm-common";

export class SdCliGenDbMigration {
  private readonly _logger = Logger.get(["simplysm", "sd-cli", "gen-db-migration"]);

  public async runAsync(config: string | undefined, dbConfigKey: string): Promise<void> {
    const configObj = await SdProjectConfigUtil.loadConfigAsync(true, [], config);
    const migrationConfig: IDbConnectionConfig & { package: string; context: string; distDir: string } = configObj["db-migration"][dbConfigKey];

    const npmConfigFilePath = SdCliPathUtil.getNpmConfigFilePath(process.cwd());
    const npmConfig: INpmConfig = await FsUtil.readJsonAsync(npmConfigFilePath);
    const allPackagePaths = await npmConfig.workspaces?.mapManyAsync(async (item) => await FsUtil.globAsync(item));
    if (!allPackagePaths) throw new NeverEntryError();

    let pkgPath = "";
    for (const packagePath of allPackagePaths) {
      const packageNpmConfigFilePath = SdCliPathUtil.getNpmConfigFilePath(packagePath);
      if (!FsUtil.exists(packageNpmConfigFilePath)) continue;
      const packageNpmConfig: INpmConfig = await FsUtil.readJsonAsync(packageNpmConfigFilePath);
      if (packageNpmConfig.name === migrationConfig.package) {
        pkgPath = packagePath;
        break;
      }
    }
    const tsconfigPath = path.resolve(pkgPath, "tsconfig.json");
    const tsconfig: ITsConfig = await FsUtil.readJsonAsync(tsconfigPath);
    const indexFilePath = path.resolve(pkgPath, tsconfig.files![0]);
    require("ts-node").register({
      project: tsconfigPath,
      require: ["tsconfig-paths"],
      transpileOnly: true,
      compilerOptions: {
        target: "es2020"
      }
    });
    const dbContextType: Type<DbContext> = require(indexFilePath)[migrationConfig.context];

    const orm = new SdOrm({
      dialect: migrationConfig.dialect ?? "mssql",
      host: migrationConfig.host,
      port: migrationConfig.port,
      username: migrationConfig.username,
      password: migrationConfig.password,
      database: migrationConfig.database,
      defaultIsolationLevel: migrationConfig.defaultIsolationLevel
    });

    const createTableQueryDefs: TQueryDef[] = [];
    const dropTableQueryDefs: TQueryDef[] = [];

    const createIndexQueryDefs: TQueryDef[] = [];
    const dropIndexQueryDefs: TQueryDef[] = [];
    const modifyIndexQueryDefs: TQueryDef[] = [];

    const addColumnQueryDefs: TQueryDef[] = [];
    const removeColumnQueryDefs: TQueryDef[] = [];
    const modifyColumnQueryDefs: TQueryDef[] = [];

    const modifyPkQueryDefs: TQueryDef[] = [];

    const createFkQueryDefs: TQueryDef[] = [];
    const removeFkQueryDefs: TQueryDef[] = [];
    const modifyFkQueryDefs: TQueryDef[] = [];

    await orm.connectAsync(dbContextType, async (db) => {
      const tableDefs = db.tableDefs;

      let dbNames: string[] = [];
      if (migrationConfig.database !== undefined) {
        dbNames = [migrationConfig.database];
      }
      else {
        dbNames = tableDefs.map((item) => item.database ?? db.schema.database).distinct();
      }

      for (const dbName of dbNames) {
        const dbTableInfos = (
          await db.getTableInfosAsync(dbName)
        ).filter((item) => item.schema !== "sys");

        const tableInfos = tableDefs.map((item) => ({
          schema: item.schema ?? db.schema.schema,
          name: item.name
        }));

        const mergedTableInfos = dbTableInfos.concat(tableInfos).distinct();
        for (const mergedTableInfo of mergedTableInfos) {
          const tableDef = tableDefs.single((item) => ObjectUtil.equal({
            schema: item.schema ?? db.schema.schema,
            name: item.name
          }, mergedTableInfo))!;

          // ??? ?????????
          if (!dbTableInfos.some((dbTableInfo) => ObjectUtil.equal(dbTableInfo, mergedTableInfo))) {
            createTableQueryDefs.push(db.getCreateTableQueryDefFromTableDef(tableDef));
            createFkQueryDefs.push(...db.getCreateFksQueryDefsFromTableDef(tableDef));
            createIndexQueryDefs.push(...db.getCreateIndexesQueryDefsFromTableDef(tableDef));
            continue;
          }

          // ????????? ?????????
          if (!tableInfos.some((tableInfo) => ObjectUtil.equal(tableInfo, mergedTableInfo))) {
            dropTableQueryDefs.push({
              type: "dropTable",
              table: {
                database: dbName,
                schema: mergedTableInfo.schema,
                name: mergedTableInfo.name
              }
            });
            continue;
          }

          // ????????? ?????????

          //-- ?????? ??????
          const dbTableColumnInfos = await db.getTableColumnInfosAsync(dbName, mergedTableInfo.schema, mergedTableInfo.name);
          const dbTableColumnNames = dbTableColumnInfos.map((item) => item.name);

          const tableColumnInfos = tableDef.columns
            .map((item) => {
              const dataTypeStr = db.qh.type(item.dataType ?? item.typeFwd());
              const dataType = dataTypeStr.split("(")[0].toLowerCase();

              const lengthStr = (dataType === "nvarchar" || dataType === "binary") ? (/\((.*)\)/).exec(dataTypeStr)?.[1]?.trim() : undefined;
              const length = lengthStr !== undefined ? (lengthStr === "MAX" ? -1 : NumberUtil.parseInt(lengthStr))
                : dataType === "ntext" ? 1073741823
                  : undefined;

              const precisionStr = (dataType !== "nvarchar" && dataType !== "binary") ? (/\((.*)[,)]/).exec(dataTypeStr)?.[1]?.trim() : undefined;
              const precision = precisionStr !== undefined ? NumberUtil.parseInt(precisionStr)
                : dataType === "bigint" ? 19
                  : undefined;

              const digitsStr = (/,(.*)\)/).exec(dataTypeStr)?.[1]?.trim();
              const digits = digitsStr !== undefined ? NumberUtil.parseInt(digitsStr)
                : dataType === "bigint" ? 0
                  : undefined;

              return {
                name: item.name,
                dataType,
                length,
                precision,
                digits,
                nullable: item.nullable ?? false,
                autoIncrement: item.autoIncrement ?? false
              };
            });
          const tableColumnNames = tableColumnInfos.map((item) => item.name);

          const mergedColumnNames = dbTableColumnNames.concat(tableColumnNames).distinct();

          for (const mergedColumnName of mergedColumnNames) {
            // ??? ??????
            if (!dbTableColumnNames.includes(mergedColumnName)) {
              addColumnQueryDefs.push(db.getAddColumnQueryDefFromTableDef(tableDef, mergedColumnName));
              continue;
            }

            // ????????? ??????
            if (!tableColumnNames.includes(mergedColumnName)) {
              removeColumnQueryDefs.push({
                type: "removeColumn",
                table: {
                  database: dbName,
                  schema: mergedTableInfo.schema,
                  name: mergedTableInfo.name
                },
                column: mergedColumnName
              });
              continue;
            }

            // ????????? ??????
            const dbTableColumnInfo = dbTableColumnInfos.single((item) => item.name === mergedColumnName)!;
            const tableColumnInfo = tableColumnInfos.single((item) => item.name === mergedColumnName)!;

            if (!ObjectUtil.equal(dbTableColumnInfo, tableColumnInfo)) {
              modifyColumnQueryDefs.push(db.getModifyColumnQueryDefFromTableDef(tableDef, mergedColumnName));
            }
          }

          //-- PK ??????
          const dbTablePkNames = await db.getTablePkColumnNamesAsync(dbName, mergedTableInfo.schema, mergedTableInfo.name);
          const tablePkNames = tableDef.columns.filter((item) => item.primaryKey)
            .orderBy((item) => item.primaryKey)
            .map((item) => item.name);

          if (!ObjectUtil.equal(dbTablePkNames, tablePkNames)) {
            modifyPkQueryDefs.push(...db.getModifyPkQueryDefFromTableDef(tableDef, tablePkNames));
          }

          //-- FK ??????
          const dbTableFks = await db.getTableFksAsync(dbName, mergedTableInfo.schema, mergedTableInfo.name);
          const dbTableFkNames = dbTableFks.map((item) => item.name);

          const tableFks = tableDef.foreignKeys.map((item) => {
            const fkTargetType = item.targetTypeFwd();
            const fkTargetTableDef = DbDefinitionUtil.getTableDef(fkTargetType);
            return {
              name: `FK_${dbName}_${mergedTableInfo.schema}_${mergedTableInfo.name}_${item.name}`,
              sourceColumnNames: item.columnPropertyKeys.map((propKey) => tableDef.columns.single((col) => col.propertyKey === propKey)!.name),
              targetSchemaName: fkTargetTableDef.schema ?? mergedTableInfo.schema,
              targetTableName: fkTargetTableDef.name
            };
          });
          const tableFkNames = tableFks.map((item) => item.name);

          const mergedFkNames = dbTableFkNames.concat(tableFkNames).distinct();
          for (const mergedFkName of mergedFkNames) {
            const orgFkName = mergedFkName.replace(`FK_${dbName}_${mergedTableInfo.schema}_${mergedTableInfo.name}_`, "");

            // ??? FK
            if (!dbTableFkNames.includes(mergedFkName)) {
              createFkQueryDefs.push(db.getAddFkQueryDefFromTableDef(tableDef, orgFkName));
              continue;
            }

            // ????????? FK
            if (!tableFkNames.includes(mergedFkName)) {
              removeFkQueryDefs.push(db.getRemoveFkQueryDefFromTableDef(tableDef, orgFkName));
              continue;
            }

            // ????????? FK
            const dbTableFk = dbTableFks.single((item) => item.name === mergedFkName)!;
            const tableFk = tableFks.single((item) => item.name === mergedFkName)!;

            if (!ObjectUtil.equal(dbTableFk, tableFk)) {
              modifyFkQueryDefs.push(...[
                db.getRemoveFkQueryDefFromTableDef(tableDef, orgFkName),
                db.getAddFkQueryDefFromTableDef(tableDef, orgFkName)
              ]);
            }
          }

          //-- ????????? ??????
          const dbTableIndexes = await db.getTableIndexesAsync(dbName, mergedTableInfo.schema, mergedTableInfo.name);
          const dbTableIndexNames = dbTableIndexes.map((item) => item.name);

          const tableIndexes = tableDef.indexes.map((item) => ({
            name: `IDX_${dbName}_${mergedTableInfo.schema}_${mergedTableInfo.name}_${item.name}`,
            columns: item.columns
              .orderBy((item1) => item1.order)
              .map((col) => ({
                name: tableDef.columns.single((col1) => col1.propertyKey === col.columnPropertyKey)!.name,
                orderBy: col.orderBy
              }))
          })).concat(
            tableDef.foreignKeys.map((item) => ({
              name: `IDX_${dbName}_${mergedTableInfo.schema}_${mergedTableInfo.name}_${item.name}`,
              columns: item.columnPropertyKeys
                .map((columnPropertyKey) => ({
                  name: tableDef.columns.single((col1) => col1.propertyKey === columnPropertyKey)!.name,
                  orderBy: "ASC"
                }))
            }))
          );
          const tableIndexNames = tableIndexes.map((item) => item.name);

          const mergedIndexNames = dbTableIndexNames.concat(tableIndexNames).distinct();

          for (const mergedIndexName of mergedIndexNames) {
            const orgIndexName = mergedIndexName.replace(`IDX_${dbName}_${mergedTableInfo.schema}_${mergedTableInfo.name}_`, "");

            // ??? INDEX
            if (!dbTableIndexNames.includes(mergedIndexName)) {
              createIndexQueryDefs.push(db.getCreateIndexQueryDefFromTableDef(tableDef, orgIndexName));
              continue;
            }

            // ????????? INDEX
            if (!tableIndexNames.includes(mergedIndexName)) {
              dropIndexQueryDefs.push(db.getDropIndexQueryDefFromTableDef(tableDef, orgIndexName));
              continue;
            }

            // ????????? INDEX
            const dbTableIndex = dbTableIndexes.single((item) => item.name === mergedIndexName)!;
            const tableIndex = tableIndexes.single((item) => item.name === mergedIndexName)!;

            if (!ObjectUtil.equal(dbTableIndex.columns, tableIndex.columns)) {
              modifyIndexQueryDefs.push(...[
                db.getDropIndexQueryDefFromTableDef(tableDef, orgIndexName),
                db.getCreateIndexQueryDefFromTableDef(tableDef, orgIndexName)
              ]);
            }
          }
        }
      }
    });

    const queryDefAndComments: (TQueryDef | string)[] = [];
    if (dropTableQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ????????? ??????",
        "// TODO: ????????? ?????????, ?????? ?????????????????? ????????? ?????? ????????? ????????? ???????????????.",
        ...dropTableQueryDefs
      ]);
    }
    if (createTableQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ????????? ??????",
        "// TODO: ????????? ?????????, ?????? ?????????????????? ????????? ?????? ????????? ????????? ???????????????.",
        ...createTableQueryDefs
      ]);
    }
    if (removeColumnQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ?????? ??????",
        "// TODO: ????????? ?????????, ?????? ??????????????? ????????? ?????? ????????? ????????? ???????????????.",
        ...removeColumnQueryDefs
      ]);
    }
    if (addColumnQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ?????? ??????",
        "// TODO: ????????? ?????????, ?????? ??????????????? ????????? ?????? ????????? ????????? ???????????????.",
        "// TODO: 'NOT NULL' ????????? ?????????(defaultValue) ?????? ???????????? ???????????? ????????? ????????? ???????????????.",
        ...addColumnQueryDefs
      ]);
    }
    if (modifyColumnQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ?????? ??????",
        "// TODO: 'NULL => NOT NULL' ????????? ?????????(defaultValue) ?????? ???????????? ???????????? ????????? ????????? ???????????????.",
        "// TODO: ?????? ????????? ???(?????? ??????)??? ??????????????? ?????? ????????? ????????? ???????????????.",
        ...modifyColumnQueryDefs
      ]);
    }
    if (modifyPkQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// PK ??????",
        "// TODO: ????????? ????????? ?????? ?????? ???????????? ???????????? ????????? ???????????????.",
        ...modifyPkQueryDefs
      ]);
    }
    if (removeFkQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// FK ??????",
        ...removeFkQueryDefs
      ]);
    }
    if (createFkQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// FK ??????",
        ...createFkQueryDefs
      ]);
    }
    if (modifyFkQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// FK ??????",
        "// TODO: ????????? ????????? ?????? ?????? ???????????? ???????????? ????????? ???????????????.",
        ...modifyFkQueryDefs
      ]);
    }
    if (dropIndexQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ????????? ??????",
        ...dropIndexQueryDefs
      ]);
    }
    if (createIndexQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ????????? ??????",
        ...createIndexQueryDefs
      ]);
    }
    if (modifyIndexQueryDefs.length > 0) {
      queryDefAndComments.push(...[
        "// ????????? ??????",
        "// TODO: ????????? ????????? ?????? ?????? ???????????? ???????????? ????????? ???????????????.",
        ...modifyIndexQueryDefs
      ]);
    }

    if (queryDefAndComments.length > 0) {
      const defsCode = queryDefAndComments
        .map((item) => (typeof item === "string" ? item : JsonConvert.stringify(item, { space: 2 }) + ","))
        .join("\r\n")
        .replace(/\r?\n/g, (item) => item + "      ")
        .replace(/"([^"]+)":/g, (item, g1) => g1 + ":")
        .slice(0, -1);

      const className = `DbMigration${new DateTime().toFormatString("yyMMddHHmmss")}`;
      const result = /* language=TEXT */ `
import { IDbMigration } from "@simplysm/sd-orm-common";
import { ${migrationConfig.context} } from "../${migrationConfig.context}";

export class ${className} implements IDbMigration {
  public async up(db: ${migrationConfig.context}): Promise<void> {
    await db.executeDefsAsync([
      ${defsCode}
    ]);
  }
}
`.replace(/\r?\n/g, "\r\n").trim();

      await FsUtil.writeFileAsync(
        path.resolve(process.cwd(), migrationConfig.distDir, className + ".ts"),
        result
      );
      this._logger.info(`????????? ?????????????????????: ${path.resolve(process.cwd(), migrationConfig.distDir, className + ".ts")}`);
    }
    else {
      this._logger.info("??????????????? ????????????.");
    }
  }
}
