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
        vi.spyOn(process.stdin, 'read');
        vi.spyOn(process.stdout, 'write');
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

    it('should handle "all" response and update all shots', async () => {
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

        // Mock readline interface
        const mockQuestion = vi.fn().mockResolvedValueOnce('all');
        vi.mock('readline', () => ({
            createInterface: () => ({
                question: mockQuestion,
                close: vi.fn()
            })
        }));

        await updateLatestVersionsSent(mockSession);

        expect(mockSession.update).toHaveBeenCalledWith(
            'CustomAttributeLink',
            ['link-1'],
            { to_id: 'version-1' }
        );
        expect(mockSession.update).toHaveBeenCalledWith(
            'ContextCustomAttributeValue',
            [mockConfigs.date.id, mockShot.id],
            expect.objectContaining({ value: expect.any(String) })
        );
    });

    it('should handle "no" response and cancel updates', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockConfigs.link] })
                .mockResolvedValueOnce({ data: [mockConfigs.date] })
                .mockResolvedValueOnce({ data: [mockShot] })
                .mockResolvedValueOnce({ data: [mockVersion] })
                .mockResolvedValueOnce({ data: [{ id: 'link-1', to_id: 'old-version' }] })
        } as unknown as Session;

        // Mock readline interface
        const mockQuestion = vi.fn().mockResolvedValueOnce('no');
        vi.mock('readline', () => ({
            createInterface: () => ({
                question: mockQuestion,
                close: vi.fn()
            })
        }));

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

        const mockQuestion = vi.fn().mockResolvedValueOnce('all');
        vi.mock('readline', () => ({
            createInterface: () => ({
                question: mockQuestion,
                close: vi.fn()
            })
        }));

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
