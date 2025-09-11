"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.PROJECT_NAME = void 0;
exports.getProjectInfo = getProjectInfo;
exports.PROJECT_NAME = 'cira-invoice-aws';
exports.VERSION = '1.0.0';
function getProjectInfo(environment = 'dev') {
    return {
        name: exports.PROJECT_NAME,
        version: exports.VERSION,
        environment
    };
}
//# sourceMappingURL=index.js.map