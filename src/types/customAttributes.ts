import type { 
  TypedCustomAttributeValueMap, 
  ContextCustomAttributeValue,
  AssetVersion
} from '../schemas/schema.ts';

// Core custom attribute interfaces
export interface AssetVersionCustomAttributes extends ContextCustomAttributeValue {
  key: 'Delivered';
  value: boolean;
}

export interface FtrackDatetime {
  __type__: 'datetime';
  value: {
      __type__: 'datetime';
      value: string | null;
  };
}

// Type guards
export function isDeliveredAttribute(attr: any): attr is AssetVersionCustomAttributes {
  return attr && 
         typeof attr === 'object' && 
         'key' in attr && 
         attr.key === 'Delivered' &&
         'value' in attr &&
         typeof attr.value === 'boolean';
}

export function isFtrackDatetime(value: any): value is FtrackDatetime {
  return value && 
         typeof value === 'object' && 
         '__type__' in value && 
         value.__type__ === 'datetime' &&
         'value' in value &&
         typeof value.value === 'object' &&
         '__type__' in value.value &&
         value.value.__type__ === 'datetime' &&
         'value' in value.value &&
         (typeof value.value.value === 'string' || value.value.value === null);
}

// Helpers
export function createFtrackDatetime(value: string | null): FtrackDatetime {
  return {
      __type__: 'datetime',
      value: {
          __type__: 'datetime',
          value
      }
  };
}