import type { 
  TypedCustomAttributeValueMap, 
  ContextCustomAttributeValue,
  AssetVersion
} from '../schemas/schema.js';

// Custom type guard to check if an attribute is a valid delivered attribute
export function isDeliveredAttribute(attr: any): attr is AssetVersionCustomAttributes {
  return attr && 
         typeof attr === 'object' && 
         'key' in attr && 
         attr.key === 'Delivered' &&
         'value' in attr &&
         typeof attr.value === 'boolean';
}

// Custom interface for handling asset version attributes
export interface AssetVersionCustomAttributes extends ContextCustomAttributeValue {
  key: 'Delivered';
  value: boolean;
}