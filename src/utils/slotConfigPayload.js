export function buildSlotConfigPayload({
  templateId,
  slots,
  fieldDefinitions,
  ignoredVariableIds,
  ignoredFieldKeys,
}) {
  const safeTemplateId = templateId != null ? String(templateId) : null;
  const safeSlots = Array.isArray(slots) ? slots : [];
  const safeFieldDefinitions = Array.isArray(fieldDefinitions) ? fieldDefinitions : [];
  const safeIgnoredVariableIds = Array.isArray(ignoredVariableIds) ? ignoredVariableIds : [];
  const safeIgnoredFieldKeys = Array.isArray(ignoredFieldKeys) ? ignoredFieldKeys : [];

  return {
    templateId: safeTemplateId,
    slots: safeSlots.map((s) => ({
      id: s?.id,
      name: s?.name,
      variables: Array.isArray(s?.variables)
        ? s.variables.map((v) => ({
            id: v?.id,
            psId: v?.psId,
            name: v?.name,
            type: v?.type || v?.varType,
            label: v?.label || v?.name,
            excelFieldKey: v?.excelFieldKey || null,
            align:
              (String(v?.type || v?.varType || '').toLowerCase() === 'text')
                ? (v?.align === 'center' || v?.align === 'right' || v?.align === 'left' ? v.align : 'left')
                : null,
            computedRule: v?.computedRule ?? null,
            computedRules: Array.isArray(v?.computedRules) ? v.computedRules : [],
          }))
        : [],
    })),
    fieldDefinitions: safeFieldDefinitions,
    ignoredVariableIds: safeIgnoredVariableIds,
    ignoredFieldKeys: safeIgnoredFieldKeys,
  };
}

