import {createTemplateAction} from '@backstage/plugin-scaffolder-backend';
import yaml from 'js-yaml';

export const sanitizeResource = () => {
    return createTemplateAction<{
        document: string;
    }>({
        id: 'cnoe:utils:sanitize',
        schema: {
            input: {
                type: 'object',
                required: ['document'],
                properties: {
                    document: {
                        type: 'string',
                        title: 'Document',
                        description: 'The document to be sanitized',
                    },
                },
            },
        },
        async handler(ctx) {
            const obj = yaml.load(ctx.input.document);
            ctx.output('sanitized', yaml.dump(removeEmptyObjects(obj)));
        },
    });
};

// remove empy elements from an object
function removeEmptyObjects(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    const newObj: any = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        const value = obj[key];
        const newValue = removeEmptyObjects(value);
        if (
            !(
                newValue === null ||
                newValue === undefined ||
                (typeof newValue === 'object' && Object.keys(newValue).length === 0)
            )
        ) {
            newObj[key] = newValue;
        }
    }

    return newObj;
}

