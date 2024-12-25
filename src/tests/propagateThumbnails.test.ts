import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '@ftrack/api';
import { propagateThumbnails } from '../tools/propagateThumbnails.ts';
import inquirer from 'inquirer';
import * as debugModule from '../utils/debug.ts';

vi.mock('inquirer');
vi.mock('../utils/debug.ts', () => ({
    debug: vi.fn(),
    isDebugMode: vi.fn().mockReturnValue(true)
}));

describe('propagateThumbnails', () => {
    const mockShots = [
        { id: 'shot-1', name: 'shot_010' },
        { id: 'shot-2', name: 'shot_020' }
    ];

    const mockVersions = [
        {
            id: 'version-1',
            version: 1,
            thumbnail_id: 'thumb-1',
            asset: { name: 'main' }
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should update thumbnail for a specific shot', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockShots[0]] })
                .mockResolvedValueOnce({ data: mockVersions }),
            update: vi.fn().mockResolvedValue(undefined)
        } as unknown as Session;

        console.log = vi.fn();

        await propagateThumbnails(mockSession, 'shot-1');

        expect(mockSession.query).toHaveBeenCalledTimes(2);
        expect(mockSession.query).toHaveBeenNthCalledWith(1, expect.stringContaining('shot-1'));
        expect(mockSession.update).toHaveBeenCalledWith('Shot', ['shot-1'], { thumbnail_id: 'thumb-1' });
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('shot_010'));
        expect(debugModule.debug).toHaveBeenCalled();
    });

    it('should process all shots when no shotId provided', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: mockShots })
                .mockResolvedValueOnce({ data: mockVersions })
                .mockResolvedValueOnce({ data: mockVersions }),
            update: vi.fn().mockResolvedValue(undefined)
        } as unknown as Session;

        vi.mocked(inquirer.prompt).mockResolvedValueOnce({ shotId: '' });
        console.log = vi.fn();

        await propagateThumbnails(mockSession);

        expect(inquirer.prompt).toHaveBeenCalledWith(expect.objectContaining({
            type: 'input',
            name: 'shotId'
        }));
        expect(mockSession.query).toHaveBeenCalledTimes(3);
        expect(mockSession.update).toHaveBeenCalledTimes(2);
        expect(debugModule.debug).toHaveBeenCalled();
    });

    it('should handle shots without versions', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockShots[0]] })
                .mockResolvedValueOnce({ data: [] }),
            update: vi.fn().mockResolvedValue(undefined)
        } as unknown as Session;

        console.log = vi.fn();

        await propagateThumbnails(mockSession, 'shot-1');

        expect(mockSession.query).toHaveBeenCalledTimes(2);
        expect(mockSession.update).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No versions'));
    });

    it('should handle errors properly', async () => {
        const mockSession = {
            query: vi.fn().mockRejectedValue(new Error('API Error'))
        } as unknown as Session;

        console.error = vi.fn();

        await expect(propagateThumbnails(mockSession, 'shot-1')).rejects.toThrow('API Error');
        expect(console.error).toHaveBeenCalledWith(
            'Error while propagating thumbnails:',
            expect.any(String)
        );
    });
});