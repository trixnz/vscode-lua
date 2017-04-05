// Extensions to original luaparse types to provide typesafety when dealing with values that are injected by vscode-lua.
import { Scope } from "../../../src/analysis/scope";

declare module 'luaparse' {
    interface NodeAdditional {
        scope: Scope
    }
}
