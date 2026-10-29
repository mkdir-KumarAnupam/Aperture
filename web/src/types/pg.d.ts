declare module 'pg' {
  export class Client {
    constructor(config?: any);
    connect(): Promise<void>;
    query(queryTextOrConfig: string | any, values?: any[]): Promise<{ rows: any[] }>;
    end(): Promise<void>;
  }
}
