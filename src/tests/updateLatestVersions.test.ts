import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '@ftrack/api';
import { updateLatestVersionsSent } from '../tools/updateLatestVersions.js';
import * as debugModule from '../utils/debug.js';

vi.mock('../utils/debug.js', () => ({
    debug: vi.fn(),
    isDebugMode: vi.fn().mockReturnValue(true)
}));

describe('updateLatestVersionsSent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should be defined', () => {
        expect(updateLatestVersionsSent).toBeDefined();
    });

    it('should process shots and their versions', async () => {
        const mockSession = {
            query: vi.fn()
                // Mock CustomAttributeLinkConfiguration query
                .mockResolvedValueOnce({ data: [{ id: 'config-1', key: 'latestVersionSent' }] })
                // Mock Shots query
                .mockResolvedValueOnce({ data: [{ id: 'shot-1', name: 'shot_010', parent: { name: 'seq_010' } }] })
                // Mock AssetVersion query
                .mockResolvedValueOnce({ data: [{ 
                    id: 'version-1',
                    version: 1,
                    asset: { name: 'main', parent: { id: 'shot-1' } },
                    date: '2023-12-25',
                    is_published: true,
                    custom_attributes: [{ key: 'delivered', value: true }]
                }] })
                // Mock current link query
                .mockResolvedValueOnce({ data: [{ id: 'link-1', to_id: 'old-version' }] })
        } as unknown as Session;

        await updateLatestVersionsSent(mockSession);
        
        expect(mockSession.query).toHaveBeenCalledTimes(4);
        expect(debugModule.debug).toHaveBeenCalled();
        expect(debugModule.debug).toHaveBeenCalledWith(expect.stringContaining('Found configuration ID:'));
    });
});
