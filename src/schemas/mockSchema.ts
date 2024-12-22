import type { EntitySchema } from '../tools/exportSchema.ts';

export const MOCK_SCHEMA: Record<string, EntitySchema> = {
    Action: {
        type: 'Action',
        baseFields: {
            id: { type: 'string', required: true },
            automation_id: { type: 'string', required: true },
            automation: { type: 'object', required: false }
        },
        sample: null,
        customAttributes: { standard: [], links: [] }
    },
    Asset: {
        type: 'Asset',
        baseFields: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: false },
            type_id: { type: 'string', required: false },
            project_id: { type: 'string', required: false },
            parent: { type: 'object', required: false },
            versions: { type: 'array', required: false },
            ancestors: { type: 'array', required: false },
            context_id: { type: 'string', required: false },
            metadata: { type: 'array', required: false },
            latest_version: { type: 'object', required: false },
            project: { type: 'object', required: false }
        },
        sample: {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Sample Asset',
            type_id: '00000000-0000-0000-0000-000000000002',
            project_id: '00000000-0000-0000-0000-000000000003'
        },
        customAttributes: { standard: [], links: [] }
    },
    AssetVersion: {
        type: 'AssetVersion',
        baseFields: {
            id: { type: 'string', required: true },
            asset_id: { type: 'string', required: false },
            version: { type: 'number', required: false },
            comment: { type: 'string', required: false },
            status_id: { type: 'string', required: true },
            is_published: { type: 'boolean', required: true },
            date: { type: 'string', required: false },
            components: { type: 'array', required: false },
            is_latest_version: { type: 'boolean', required: false },
            project: { type: 'object', required: false },
            project_id: { type: 'string', required: false },
            task: { type: 'object', required: false },
            task_id: { type: 'string', required: false }
        },
        customAttributes: {
            standard: [
                {
                    id: 'custom_delivered',
                    key: 'delivered',
                    label: 'Delivered',
                    config: { type: 'boolean' },
                    entity_type: 'AssetVersion'
                },
                {
                    id: 'custom_date_sent',
                    key: 'date_sent',
                    label: 'Date Sent',
                    config: { type: 'date' },
                    entity_type: 'AssetVersion'
                }
            ],
            links: []
        },
        sample: {
            id: '11111111-1111-1111-1111-111111111111',
            asset_id: '00000000-0000-0000-0000-000000000001',
            version: 1,
            comment: 'Sample comment',
            status_id: '22222222-2222-2222-2222-222222222222',
            is_published: true,
            date: '2024-01-01T00:00:00Z',
            is_latest_version: true
        }
    },
    Project: {
        type: 'Project',
        baseFields: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            project_schema_id: { type: 'string', required: true },
            status: { type: 'string', required: true },
            disk_id: { type: 'string', required: false },
            root: { type: 'string', required: false }
        },
        customAttributes: {
            standard: [
                {
                    id: 'custom_fps',
                    key: 'fps',
                    label: 'FPS',
                    config: { type: 'number' },
                    entity_type: 'Project'
                }
            ],
            links: []
        },
        sample: {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Sample Project',
            project_schema_id: '44444444-4444-4444-4444-444444444444',
            status: 'active'
        }
    },
    Shot: {
        type: 'Shot',
        baseFields: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            description: { type: 'string', required: false },
            status_id: { type: 'string', required: true },
            project_id: { type: 'string', required: false },
            parent_id: { type: 'string', required: false },
            type_id: { type: 'string', required: true },
            bid: { type: 'number', required: false },
            end_date: { type: 'string', required: false },
            start_date: { type: 'string', required: false },
            priority_id: { type: 'string', required: false },
            sort: { type: 'number', required: false }
        },
        customAttributes: {
            standard: [
                {
                    id: 'custom_frame_start',
                    key: 'fstart',
                    label: 'Frame Start',
                    config: { type: 'number' },
                    entity_type: 'Shot'
                },
                {
                    id: 'custom_frame_end',
                    key: 'fend',
                    label: 'Frame End',
                    config: { type: 'number' },
                    entity_type: 'Shot'
                },
                {
                    id: 'custom_fps',
                    key: 'fps',
                    label: 'FPS',
                    config: { type: 'number' },
                    entity_type: 'Shot'
                },
                {
                    id: 'custom_handles',
                    key: 'handles',
                    label: 'Frame handles',
                    config: { type: 'number' },
                    entity_type: 'Shot'
                }
            ],
            links: [
                {
                    id: 'custom_linked_asset',
                    key: 'linked_asset',
                    label: 'Linked Asset',
                    config: { type: 'link' },
                    type: 'link',
                    entity_type: 'Shot'
                }
            ]
        },
        sample: {
            id: '55555555-5555-5555-5555-555555555555',
            name: 'Sample Shot',
            status_id: '22222222-2222-2222-2222-222222222222',
            project_id: '33333333-3333-3333-3333-333333333333',
            type_id: '00000000-0000-0000-0000-000000000002',
            bid: 0,
            sort: 0
        }
    },
    Task: {
        type: 'Task',
        baseFields: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            description: { type: 'string', required: false },
            status_id: { type: 'string', required: true },
            type_id: { type: 'string', required: true },
            project_id: { type: 'string', required: false },
            parent_id: { type: 'string', required: false },
            start_date: { type: 'date', required: false },
            end_date: { type: 'date', required: false }
        },
        customAttributes: {
            standard: [
                {
                    id: 'custom_percent_complete',
                    key: 'percent_complete',
                    label: 'Percent Complete',
                    config: { type: 'number' },
                    entity_type: 'Task'
                }
            ],
            links: []
        },
        sample: {
            id: '66666666-6666-6666-6666-666666666666',
            name: 'Sample Task',
            status_id: '22222222-2222-2222-2222-222222222222',
            type_id: '00000000-0000-0000-0000-000000000002'
        }
    },
    Sequence: {
        type: 'Sequence',
        baseFields: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            description: { type: 'string', required: false },
            project_id: { type: 'string', required: false },
            parent_id: { type: 'string', required: false }
        },
        customAttributes: {
            standard: [
                {
                    id: 'custom_fps',
                    key: 'fps',
                    label: 'FPS',
                    config: { type: 'number' },
                    entity_type: 'Sequence'
                }
            ],
            links: []
        },
        sample: {
            id: '77777777-7777-7777-7777-777777777777',
            name: 'Sample Sequence'
        }
    },
    User: {
        type: 'User',
        baseFields: {
            id: { type: 'string', required: true },
            username: { type: 'string', required: true },
            first_name: { type: 'string', required: false },
            last_name: { type: 'string', required: false },
            email: { type: 'string', required: false },
            is_active: { type: 'boolean', required: true }
        },
        customAttributes: { standard: [], links: [] },
        sample: {
            id: '88888888-8888-8888-8888-888888888888',
            username: 'sample.user',
            is_active: true
        }
    }
};