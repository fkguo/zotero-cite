"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBibtexFromZotero = exports.getBibliographyInGroup = exports.getItemGroupName = exports.getGroups = exports.getMarkdownBibliography = exports.pickCiteKeys = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("./config");
const i18n_1 = require("./i18n");
class EndpointAccessError extends Error {
}
function createEndpointAccessError(endpointName, endpointUrl, settingKey, error) {
    return new EndpointAccessError((0, i18n_1.t)("error.zoteroEndpointUnavailable", {
        endpoint: endpointName,
        url: endpointUrl,
        settingKey,
        message: (0, i18n_1.errorToMessage)(error),
    }));
}
async function postJsonRpc(method, params = []) {
    const jsonRpcUrl = (0, config_1.getJsonRpcUrl)();
    let response;
    try {
        response = await axios_1.default.post(jsonRpcUrl, {
            jsonrpc: "2.0",
            method,
            params,
        });
    }
    catch (error) {
        throw createEndpointAccessError("JSON-RPC", jsonRpcUrl, "zotero-cite.jsonRpcUrl", error);
    }
    const data = response.data;
    if (data.error) {
        throw new Error(data.error.message || "Unknown Zotero error");
    }
    return data.result;
}
async function pickCiteKeys() {
    const caywUrl = (0, config_1.getCaywUrl)();
    let response;
    try {
        response = await (0, axios_1.default)({
            method: "get",
            url: caywUrl,
            params: {
                format: "pandoc",
                brackets: "1",
                minimize: (0, config_1.getMinimizeZotero)(),
            },
        });
    }
    catch (error) {
        throw createEndpointAccessError("CAYW", caywUrl, "zotero-cite.caywUrl", error);
    }
    const citeKeys = [];
    const pattern = /@([\w-:\d]+)/g;
    const dataText = String(response.data ?? "");
    let match;
    while ((match = pattern.exec(dataText)) !== null) {
        citeKeys.push(match[1]);
    }
    if (citeKeys.length === 0) {
        throw new Error((0, i18n_1.t)("error.noItemSelected"));
    }
    return citeKeys;
}
exports.pickCiteKeys = pickCiteKeys;
async function getMarkdownBibliography(citeKey) {
    const result = await postJsonRpc("item.bibliography", [
        ["@" + citeKey],
        {
            id: (0, config_1.getBibliographyStyle)(),
        },
    ]);
    return result || "";
}
exports.getMarkdownBibliography = getMarkdownBibliography;
async function getGroups() {
    const result = await postJsonRpc("user.groups");
    const groups = {};
    (result || []).forEach((item) => {
        groups[item.name] = String(item.id);
    });
    return groups;
}
exports.getGroups = getGroups;
async function getItemGroupName(key) {
    const result = await postJsonRpc("item.search", [key]);
    for (const item of result || []) {
        if (item["citation-key"] === key) {
            return item.library;
        }
    }
    throw new Error((0, i18n_1.t)("error.itemNotFound", { key }));
}
exports.getItemGroupName = getItemGroupName;
async function getBibliographyInGroup(keys, groupId) {
    return postJsonRpc("item.export", [keys, (0, config_1.getLatexBibStyle)(), groupId]);
}
exports.getBibliographyInGroup = getBibliographyInGroup;
async function getBibtexFromZotero(citeKey) {
    try {
        const result = await postJsonRpc("item.export", [[citeKey], "bibtex"]);
        return result ? String(result) : null;
    }
    catch (error) {
        if (error instanceof EndpointAccessError) {
            throw error;
        }
        // Keep compatibility: missing/unreachable entries are handled as null by caller.
        console.warn((0, i18n_1.errorToMessage)(error));
        return null;
    }
}
exports.getBibtexFromZotero = getBibtexFromZotero;
//# sourceMappingURL=zotero.js.map