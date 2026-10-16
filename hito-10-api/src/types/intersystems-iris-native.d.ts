declare module '@intersystems/intersystems-iris-native' {
  export type IRISReturnType =
    string | number | bigint | boolean | Buffer | IRISObject
  export interface Connection {
    close(): void
    createIris(): Iris
  }
  export interface Iris {
    classMethodObject(
      className: string,
      methodName: string,
      ...args: unknown[]
    ): IRISReturnType | null
    classMethodBoolean(
      className: string,
      methodName: string,
      ...args: unknown[]
    ): boolean | null
  }
  export interface IRISObject {
    getObject(propertyName: string): IRISReturnType | null
    getString(propertyName: string): string | null
    getNumber(propertyName: string): number | null
    invoke(methodName: string, ...args: unknown[]): IRISReturnType | null
    invokeObject(methodName: string, ...args: unknown[]): IRISReturnType | null
    invokeBoolean(methodName: string, ...args: unknown[]): boolean | null
    invokeString(methodName: string, ...args: unknown[]): string | null
  }
  export namespace IRISReference {
    enum Type {
      STRING = 7,
    }
  }
  export class IRISReference {
    constructor(value: unknown, type?: IRISReference.Type)
    getString(): string | null
  }
  export function createConnection(input: {
    host: string
    port: number
    ns: string
    user: string
    pwd: string
    sharedmemory?: boolean
    timeout?: number
  }): Connection
}
