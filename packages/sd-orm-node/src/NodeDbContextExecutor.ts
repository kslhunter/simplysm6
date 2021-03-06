import {
  IDbConnectionConfig,
  IDbContextExecutor,
  IQueryColumnDef,
  IQueryResultParseOption,
  ISOLATION_LEVEL,
  QueryBuilder,
  SdOrmUtil,
  TQueryDef
} from "@simplysm/sd-orm-common";
import { IDbConnection } from "./IDbConnection";
import { DbConnectionFactory } from "./DbConnectionFactory";

export class NodeDbContextExecutor implements IDbContextExecutor {
  private _conn?: IDbConnection;
  public dialect: "mysql" | "mssql" | "mssql-azure";
  public database: string;
  public schema: string;

  public constructor(private readonly _config: IDbConnectionConfig,
                     database: string,
                     schema: string) {
    this.dialect = this._config.dialect ?? "mssql";
    this.database = database;
    this.schema = schema;
  }

  public async connectAsync(): Promise<void> {
    this._conn = DbConnectionFactory.create(this._config, this.database);
    await this._conn.connectAsync();
  }

  public async beginTransactionAsync(isolationLevel?: ISOLATION_LEVEL): Promise<void> {
    if (!this._conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }
    await this._conn.beginTransactionAsync(isolationLevel);
  }

  public async commitTransactionAsync(): Promise<void> {
    if (!this._conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await this._conn.commitTransactionAsync();
  }

  public async rollbackTransactionAsync(): Promise<void> {
    if (!this._conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await this._conn.rollbackTransactionAsync();
  }

  public async closeAsync(): Promise<void> {
    if (!this._conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await this._conn.closeAsync();
  }

  public async executeAsync(queries: string[]): Promise<any[][]> {
    if (!this._conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    return await this._conn.executeAsync(queries);
  }

  public async bulkInsertAsync(tableName: string, columnDefs: IQueryColumnDef[], records: Record<string, any>[]): Promise<void> {
    if (!this._conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await this._conn.bulkInsertAsync(tableName, columnDefs, records);
  }

  public async executeDefsAsync(defs: TQueryDef[], options?: (IQueryResultParseOption | undefined)[]): Promise<any[][]> {
    if (!this._conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    const result = await this._conn.executeAsync(
      defs.map((def) => new QueryBuilder(this.dialect).query(def))
    );
    return result.map((item, i) => SdOrmUtil.parseQueryResult(item, options ? options[i] : undefined));
  }
}
