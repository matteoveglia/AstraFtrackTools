import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '@ftrack/api';
import { updateLatestVersionsSent } from '../tools/updateLatestVersions.js';
import * as debugModule from '../utils/debug.js';
import { createInterface } from 'readline';

vi.mock('../utils/debug.js', () => ({
    debug: vi.fn(),
    isDebugMode: vi.fn().mockReturnValue(true)
}));

describe('updateLatestVersionsSent', () => {
    const mockConfigs = {
        link: { id: 'config-1', key: 'latestVersionSent' },
        date: { id: 'date-config-1', key: 'latestVersionSentDate' }
    };

    const mockShot = {
        id: 'shot-1',
        name: 'shot_010',
        parent: { name: 'seq_010' }
    };

    const mockVersion = {
        id: 'version-1',
        version: 1,
        asset: { name: 'main', parent: { id: 'shot-1' } },
        date: '2023-12-25T12:00:00.000Z', // Make the date more explicit
        is_published: true,
        custom_attributes: [{ key: 'delivered', value: true }]
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        // Reset readline mock for each test
        vi.mock('readline', () => ({
            createInterface: () => ({
                question: (q: string) => new Promise(resolve => resolve('no')),
                close: vi.fn()
            })
        }));
    });

    it('should be defined', () => {
        expect(updateLatestVersionsSent).toBeDefined();
    });

    it('should process shots and their versions', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockConfigs.link] })
                .mockResolvedValueOnce({ data: [mockConfigs.date] })
                .mockResolvedValueOnce({ data: [mockShot] })
                .mockResolvedValueOnce({ data: [mockVersion] })
                .mockResolvedValueOnce({ data: [{ id: 'link-1', to_id: 'old-version' }] }),
            update: vi.fn().mockResolvedValue(undefined),
            call: vi.fn().mockResolvedValue(undefined)
        } as unknown as Session;

        await updateLatestVersionsSent(mockSession);
        
        expect(mockSession.query).toHaveBeenCalledTimes(5);
        expect(debugModule.debug).toHaveBeenCalled();
    });

    it('should handle "all" response and update all shots', async () => {
        // Override default readline mock for this test
        vi.mock('readline', () => ({
            createInterface: () => ({
                question: (q: string) => new Promise(resolve => resolve('all')),
                close: vi.fn()
            })
        }));

        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockConfigs.link] })
                .mockResolvedValueOnce({ data: [mockConfigs.date] })
                .mockResolvedValueOnce({ data: [mockShot] })
                .mockResolvedValueOnce({ data: [mockVersion] })
                .mockResolvedValueOnce({ data: [{ id: 'link-1', to_id: 'old-version' }] }),
            update: vi.fn().mockResolvedValue(undefined),
            call: vi.fn().mockResolvedValue(undefined)
        } as unknown as Session;

        await updateLatestVersionsSent(mockSession);

        expect(mockSession.update).toHaveBeenCalledWith(
            'CustomAttributeLink',
            ['link-1'],
            { to_id: 'version-1' }
        );
    });

    it('should handle "no" response and cancel updates', async () => {
        // Override default readline mock for this test
        vi.mock('readline', () => ({
            createInterface: () => ({
                question: (q: string) => new Promise(resolve => resolve('no')),
                close: vi.fn()
            })
        }));

        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockConfigs.link] })
                .mockResolvedValueOnce({ data: [mockConfigs.date] })
                .mockResolvedValueOnce({ data: [mockShot] })
                .mockResolvedValueOnce({ data: [mockVersion] })
                .mockResolvedValueOnce({ data: [{ id: 'link-1', to_id: 'old-version' }] })
        } as unknown as Session;

        await updateLatestVersionsSent(mockSession);

        expect(mockSession.update).not.toHaveBeenCalled();
    });

    it('should handle missing configurations', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [] }) // No link config
                .mockResolvedValueOnce({ data: [] }) // No date config
        } as unknown as Session;

        await expect(updateLatestVersionsSent(mockSession))
            .rejects.toThrow('Could not find latestVersionSent configuration');
    });

    it('should skip shots with no delivered versions', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockConfigs.link] })
                .mockResolvedValueOnce({ data: [mockConfigs.date] })
                .mockResolvedValueOnce({ data: [mockShot] })
                .mockResolvedValueOnce({ data: [] }) // No versions
                .mockResolvedValueOnce({ data: [] }) // No current link
        } as unknown as Session;

        await updateLatestVersionsSent(mockSession);

        expect(mockSession.update).not.toHaveBeenCalled();
        expect(debugModule.debug).toHaveBeenCalledWith(expect.stringContaining('Found 0 delivered versions'));
    });

    it('should update date in ISO format', async () => {
        // Override default readline mock for this test
        vi.mock('readline', () => ({
            createInterface: () => ({
                question: (q: string) => new Promise(resolve => resolve('all')),
                close: vi.fn()
            })
        }));

        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockConfigs.link] })
                .mockResolvedValueOnce({ data: [mockConfigs.date] })
                .mockResolvedValueOnce({ data: [mockShot] })
                .mockResolvedValueOnce({ data: [mockVersion] })
                .mockResolvedValueOnce({ data: [{ id: 'link-1', to_id: 'old-version' }] }),
            update: vi.fn().mockResolvedValue(undefined),
            call: vi.fn().mockResolvedValue(undefined)
        } as unknown as Session;

        await updateLatestVersionsSent(mockSession);

        // Verify the date format in the update call
        expect(mockSession.update).toHaveBeenCalledWith(
            'ContextCustomAttributeValue',
            [mockConfigs.date.id, mockShot.id],
            expect.objectContaining({
                value: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
            })
        );
    });
});
