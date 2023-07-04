"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteRegKeyValue = exports.DeleteRegKeyKey = exports.SetStringRegKey = exports.GetStringRegKey = exports.EnumRegKeyValues = exports.EnumRegKeyKeys = void 0;
const windowRegistry = process.platform === 'win32' ? require('./winregistry.node') : null;
function EnumRegKeyKeys(hive, path) {
    if (windowRegistry) {
        return windowRegistry.EnumRegKeyKeys(hive, path);
    }
    console.error('Could not initialize Windows Registry native node module.');
    return [];
}
exports.EnumRegKeyKeys = EnumRegKeyKeys;
function EnumRegKeyValues(hive, path) {
    if (windowRegistry) {
        return windowRegistry.EnumRegKeyValues(hive, path);
    }
    console.error('Could not initialize Windows Registry native node module.');
    return [];
}
exports.EnumRegKeyValues = EnumRegKeyValues;
function GetStringRegKey(hive, path, name) {
    if (windowRegistry) {
        return windowRegistry.GetStringRegKey(hive, path, name);
    }
    throw new Error('GetStringRegKey is only available on Windows.');
}
exports.GetStringRegKey = GetStringRegKey;
function SetStringRegKey(hive, path, name, value) {
    if (windowRegistry) {
        windowRegistry.SetStringRegKey(hive, path, name, value);
    }
    else {
        console.error('Could not initialize Windows Registry native node module.');
    }
}
exports.SetStringRegKey = SetStringRegKey;
function DeleteRegKeyKey(hive, path, name) {
    if (windowRegistry) {
        windowRegistry.DeleteRegKeyKey(hive, path, name);
    }
    else {
        console.error('Could not initialize Windows Registry native node module.');
    }
}
exports.DeleteRegKeyKey = DeleteRegKeyKey;
function DeleteRegKeyValue(hive, path, name) {
    if (windowRegistry) {
        windowRegistry.DeleteRegKeyValue(hive, path, name);
    }
    else {
        console.error('Could not initialize Windows Registry native node module.');
    }
}
exports.DeleteRegKeyValue = DeleteRegKeyValue;
//# sourceMappingURL=index.js.map