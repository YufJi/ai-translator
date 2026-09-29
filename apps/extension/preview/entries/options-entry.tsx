import { defaultConfig } from "@ai-translator/core";
import { CONFIG_STORAGE_KEY } from "../../src/messages.ts";
import { fireInstalled, installChromeStub, setPreviewRole } from "../chrome-stub.ts";

installChromeStub({ [CONFIG_STORAGE_KEY]: defaultConfig() });

setPreviewRole("background");
await import("../../src/background.ts");
fireInstalled();

setPreviewRole("options");
await import("../../src/options.tsx");

