"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATABASE_VERSION = void 0;
exports.getDatabaseInfo = getDatabaseInfo;
exports.DATABASE_VERSION = '1.0.0';
function getDatabaseInfo() {
    return {
        name: 'cira-invoice-db',
        version: exports.DATABASE_VERSION,
        type: 'postgresql'
    };
}
//# sourceMappingURL=index.js.map