import { defaultConfig } from "../../../../packages/core/src/index.ts";
import { CONFIG_STORAGE_KEY } from "../../src/messages.ts";
import { fireInstalled, installChromeStub, setPreviewRole, setPreviewSelection } from "../chrome-stub.ts";

setPreviewSelection("The quick brown fox jumps over the lazy dog.");
installChromeStub({ [CONFIG_STORAGE_KEY]: defaultConfig() });

setPreviewRole("background");
await import("../../src/background.ts");
fireInstalled();

setPreviewRole("popup");
await import("../../src/popup.ts");

document.body.dataset.ready = "true";
