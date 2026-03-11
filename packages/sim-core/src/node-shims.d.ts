declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options?: {
      recursive?: boolean;
    },
  ): Promise<void>;

  export function readFile(path: string, encoding: string): Promise<string>;

  export function readdir(path: string): Promise<string[]>;

  export function writeFile(
    path: string,
    data: string,
    encoding: string,
  ): Promise<void>;
}

declare module "node:path" {
  export function basename(path: string, suffix?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function resolve(...paths: string[]): string;
}

declare const console: {
  error(...args: unknown[]): void;
  log(...args: unknown[]): void;
};

declare const process: {
  argv: string[];
  cwd(): string;
  exitCode: number | undefined;
};
