import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '@ftrack/api';
import inspectShot from '../tools/inspectShot.js';
import inquirer from 'inquirer';
import * as debugModule from '../utils/debug.js';

vi.mock('inquirer');
vi.mock('../utils/debug.js', () => ({
    debug: vi.fn(),
    isDebugMode: vi.fn().mockReturnValue(true)
}));

describe('inspectShot', () => {
    const mockShotData = {
        id: 'shot-1',
        name: 'shot_010',
        parent: {
            id: 'seq-1',
            name: 'seq_010',
            type: { name: 'Sequence' }
        },
        project: {
            id: 'proj-1',
            name: 'Project 1'
        },
        status: {
            name: 'Active',
            id: 'status-1'
        }
    };

    const mockTasksData = [{
        id: 'task-1',
        name: 'Animation',
        type: { name: 'Animation' },
        status: { name: 'In Progress' },
        priority: { name: 'Medium' }
    }];

    const mockVersionsData = [{
        id: 'version-1',
        version: 1,
        asset: { name: 'main' },
        status: { name: 'Approved' },
        date: '2024-01-01',
        is_published: true
    }];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should process shot details with provided shotId', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockShotData] })
                .mockResolvedValueOnce({ data: mockTasksData })
                .mockResolvedValueOnce({ data: mockVersionsData })
        } as unknown as Session;

        console.log = vi.fn();

        await inspectShot(mockSession, 'shot-1');

        expect(mockSession.query).toHaveBeenCalledTimes(3);
        expect(mockSession.query).toHaveBeenNthCalledWith(1, expect.stringContaining('shot-1'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('SHOT DETAILS'));
        expect(debugModule.debug).toHaveBeenCalled();
    });

    it('should prompt for shot ID when none provided', async () => {
        const mockSession = {
            query: vi.fn()
                .mockResolvedValueOnce({ data: [mockShotData] })
                .mockResolvedValueOnce({ data: mockTasksData })
                .mockResolvedValueOnce({ data: mockVersionsData })
        } as unknown as Session;

        vi.mocked(inquirer.prompt).mockResolvedValueOnce({ shotId: 'shot-1' });
        console.log = vi.fn();

        await inspectShot(mockSession);

        expect(inquirer.prompt).toHaveBeenCalledWith(expect.objectContaining({
            type: 'input',
            name: 'shotId'
        }));
        expect(mockSession.query).toHaveBeenCalledTimes(3);
        expect(debugModule.debug).toHaveBeenCalled();
    });

    it('should handle errors properly', async () => {
        const mockSession = {
            query: vi.fn().mockRejectedValue(new Error('API Error'))
        } as unknown as Session;

        console.error = vi.fn();

        await expect(inspectShot(mockSession, 'shot-1')).rejects.toThrow('API Error');
        expect(console.error).toHaveBeenCalledWith(
            'Error while fetching shot information:',
            expect.any(String)
        );
    });
});