import * as os from 'os';
import * as path from 'path';
export function expandHomePath(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        return trimmed;
    }
    if (!trimmed.startsWith('~')) {
        return trimmed;
    }
    const home = os.homedir();
    /* istanbul ignore if -- Cannot mock os.homedir in ESM environment */
    if (!home) {
        return trimmed;
    }
    if (trimmed === '~') {
        return home;
    }
    if (trimmed.startsWith('~/')) {
        return path.join(home, trimmed.slice(2));
    }
    if (trimmed.startsWith('~\\')) {
        return path.join(home, trimmed.slice(2));
    }
    return path.join(home, trimmed.slice(1));
}
//# sourceMappingURL=path.js.map