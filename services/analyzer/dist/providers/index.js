"use strict";
/**
 * Provider factory and exports
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
exports.createProvider = createProvider;
exports.getProviderForMediaType = getProviderForMediaType;
const gemini_js_1 = require("./gemini.js");
__exportStar(require("./types.js"), exports);
var gemini_js_2 = require("./gemini.js");
Object.defineProperty(exports, "GeminiProvider", { enumerable: true, get: function () { return gemini_js_2.GeminiProvider; } });
/**
 * Create a provider instance by name
 */
function createProvider(name, config) {
    switch (name) {
        case 'gemini':
            if (!config.gemini?.apiKey) {
                throw new Error('Gemini API key is required');
            }
            return new gemini_js_1.GeminiProvider(config.gemini.apiKey, config.gemini.model);
        case 'claude':
            // TODO: Implement Claude provider
            throw new Error('Claude provider not yet implemented');
        case 'openai':
            // TODO: Implement OpenAI provider
            throw new Error('OpenAI provider not yet implemented');
        default:
            throw new Error(`Unknown provider: ${name}`);
    }
}
/**
 * Get the configured provider for a specific media type
 */
function getProviderForMediaType(mediaType, providers, config) {
    const providerName = providers[mediaType];
    return createProvider(providerName, config);
}
