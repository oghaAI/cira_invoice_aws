"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKFLOW_VERSION = void 0;
exports.getWorkflowInfo = getWorkflowInfo;
exports.WORKFLOW_VERSION = '1.0.0';
function getWorkflowInfo() {
    return {
        name: 'cira-invoice-workflow',
        version: exports.WORKFLOW_VERSION,
        type: 'step-functions'
    };
}
//# sourceMappingURL=index.js.map