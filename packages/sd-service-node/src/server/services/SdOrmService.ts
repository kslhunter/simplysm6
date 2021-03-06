import { Logger } from "@simplysm/sd-core-node";
import { DbConnectionFactory, IDbConnection } from "@simplysm/sd-orm-node";
import {
  IDbConnectionConfig,
  IQueryColumnDef,
  IQueryResultParseOption,
  ISOLATION_LEVEL,
  QueryBuilder,
  SdOrmUtil,
  TQueryDef
} from "@simplysm/sd-orm-common";
import { SdServiceBase } from "../SdServiceBase";
import { SdServiceServerConfigUtil } from "../SdServiceServerConfigUtil";

export class SdOrmService extends SdServiceBase {
  private readonly _logger = Logger.get(["simplysm", "sd-orm-service", this.constructor.name]);

  private static readonly _connections = new Map<number, IDbConnection>();
  private static readonly _wsConnectionCloseListenerMap = new Map<number, () => Promise<void>>();

  public async getDialectAsync(configName: string): Promise<"mssql" | "mysql" | "mssql-azure" | undefined> {
    const config = await this._getOrmConfigAsync(configName);
    return config.dialect;
  }

  public async connectAsync(configName: string, database: string): Promise<number> {
    const config = await this._getOrmConfigAsync(configName);

    const conn = DbConnectionFactory.create(config, database);

    const lastConnId = Array.from(SdOrmService._connections.keys()).max() ?? 0;
    const connId = lastConnId + 1;
    SdOrmService._connections.set(connId, conn);

    await conn.connectAsync();

    const closeEventListener = async (): Promise<void> => {
      await conn.closeAsync();
      this._logger.warn("소켓연결이 끊어져, DB 연결이 중지되었습니다.");
    };
    SdOrmService._wsConnectionCloseListenerMap.set(connId, closeEventListener);
    this.conn.on("close", closeEventListener);

    conn.on("close", () => {
      SdOrmService._connections.delete(connId);
      SdOrmService._wsConnectionCloseListenerMap.delete(connId);
      this.conn.off("close", closeEventListener);
    });

    return connId;
  }

  public async closeAsync(connId: number): Promise<void> {
    const conn = SdOrmService._connections.get(connId);
    if (conn) {
      await conn.closeAsync();
    }
  }

  public async beginTransactionAsync(connId: number, isolationLevel?: ISOLATION_LEVEL): Promise<void> {
    const conn = SdOrmService._connections.get(connId);
    if (!conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await conn.beginTransactionAsync(isolationLevel);
  }

  public async commitTransactionAsync(connId: number): Promise<void> {
    const conn = SdOrmService._connections.get(connId);
    if (!conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await conn.commitTransactionAsync();
  }

  public async rollbackTransactionAsync(connId: number): Promise<void> {
    const conn = SdOrmService._connections.get(connId);
    if (!conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await conn.rollbackTransactionAsync();
  }


  public async executeAsync(connId: number, queries: string[]): Promise<any[][]> {
    const conn = SdOrmService._connections.get(connId);
    if (!conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    return await conn.executeAsync(queries);
  }

  public async executeDefsAsync(connId: number, defs: TQueryDef[], options?: (IQueryResultParseOption | undefined)[]): Promise<any[][]> {
    const conn = SdOrmService._connections.get(connId);
    if (!conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    const result = await conn.executeAsync(defs.map((def) => new QueryBuilder(conn.dialect).query(def)));
    return result.map((item, i) => SdOrmUtil.parseQueryResult(item, options ? options[i] : undefined));
  }

  public async bulkInsertAsync(connId: number, tableName: string, columnDefs: IQueryColumnDef[], records: Record<string, any>[]): Promise<void> {
    const conn = SdOrmService._connections.get(connId);
    if (!conn) {
      throw new Error("DB에 연결되어있지 않습니다.");
    }

    await conn.bulkInsertAsync(tableName, columnDefs, records);
  }

  private async _getOrmConfigAsync(configName: string): Promise<IDbConnectionConfig> {
    const config: IDbConnectionConfig | undefined = (
      await SdServiceServerConfigUtil.getConfigAsync(this.server.rootPath, this.request.url)
    ).orm?.[configName];
    if (config === undefined) {
      throw new Error("서버에서 ORM 설정을 찾을 수 없습니다.");
    }

    return config;
  }
}
