export {
  TemplateRegistry,
  templateRegistry,
  extractPlaceholders,
  validateTemplateConsistency,
  validateTemplateDirectory,
} from "@/features/templates/template-registry";
export { TemplatesBrowser } from "@/features/templates/templates-browser";
export {
  LOCKED_TEMPLATE_PROPERTIES,
  FORBIDDEN_USER_CONTROLS,
  ALLOWED_DYNAMIC_FIELDS,
  FORMAT_DIMENSIONS,
} from "@/features/templates/locked-properties";
export {
  validatePlaceholdersBidirectional,
  validateTemplateStructure,
  validateTemplateFields,
  validateLockedProperties,
  parseTemplateConfig,
  TemplateValidationError,
} from "@/features/templates/template-validator";
