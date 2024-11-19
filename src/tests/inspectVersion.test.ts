import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '@ftrack/api';
import { inspectVersion } from '../tools/inspectVersion.js';
import inquirer from 'inquirer';
import * as debugModule from '../utils/debug.js';

vi.mock('inquirer');
vi.mock('../utils/debug.js', () => ({
    debug: vi.fn(),
    isDebugMode: vi.fn().mockReturnValue(true)
}));

describe('inspectVersion', () => {
    const mockVersionData = {
        id: 'version-1',
        version: 1,
        asset: {
            id: 'asset-1',
            name: 'main',
            parent: {
                id: 'shot-1',
                name: 'shot_010',
                type: { name: 'Shot' }
            }
        }
    };

    const mockLinksData = [{
        id: 'link-1',
        configuration: {
            key: 'latestVersionSent',
            id: 'config-1'
        },
        from_id: 'version-1',
        to_id: 'shot-1'
    }];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should query version details with provided versionId', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockVersionData] })
                .mockResolvedValueOnce({ data: mockLinksData })
        } as unknown as Session;

        console.log = vi.fn();

        await inspectVersion(mockSession, 'version-1');

        expect(mockSession.query).toHaveBeenCalledTimes(2);
        expect(mockSession.query).toHaveBeenNthCalledWith(1, expect.stringContaining('version-1'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('VERSION DETAILS'));
        expect(debugModule.debug).toHaveBeenCalledWith(expect.any(String));
    });

    it('should prompt for version ID when none provided', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockVersionData] })
                .mockResolvedValueOnce({ data: mockLinksData })
        } as unknown as Session;

        vi.mocked(inquirer.prompt).mockResolvedValueOnce({ versionId: 'version-1' });
        console.log = vi.fn();

        await inspectVersion(mockSession);

        expect(inquirer.prompt).toHaveBeenCalledWith(expect.objectContaining({
            type: 'input',
            name: 'versionId'
        }));
        expect(mockSession.query).toHaveBeenCalledTimes(2);
        expect(debugModule.debug).toHaveBeenCalled();
    });
});
