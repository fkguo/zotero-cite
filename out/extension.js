"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const commands_1 = require("./commands");
const i18n_1 = require("./i18n");
const ui_1 = require("./ui");
function activate(context) {
    console.log((0, i18n_1.t)("activate.message"));
    (0, commands_1.registerCommands)(context);
}
exports.activate = activate;
function deactivate() {
    (0, ui_1.disposeUiResources)();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map