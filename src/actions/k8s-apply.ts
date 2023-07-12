import {createTemplateAction} from '@backstage/plugin-scaffolder-backend';
import {KubeConfig, CustomObjectsApi} from '@kubernetes/client-node';
import yaml from 'js-yaml';

export const createKubernetesApply = () => {
    return createTemplateAction<{
        manifest: string;
        namespaced: boolean;
    }>({
        id: 'cnoe:kubernetes:apply',
        schema: {
            input: {
                type: 'object',
                required: ['manifest', 'namespaced'],
                properties: {
                    manifest: {
                        type: 'string',
                        title: 'Manifest',
                        description: 'The manifest to apply in the cluster',
                    },
                    namespaced: {
                        type: 'boolean',
                        title: 'Namespaced',
                        description: 'Whether the API is namespaced or not',
                    },
                },
            },
        },
        async handler(ctx) {
            const obj: any = yaml.load(ctx.input.manifest);
            const words = obj.apiVersion.split('/');
            const group = words[0];
            const version = words[1];
            //hack. needs fixing to correctly extract the plurals
            const plural = obj.kind.toLowerCase() + 's';

            // hack. needs fixing to get the KubeConfig info from app-config.yaml
            const kc = new KubeConfig();
            kc.loadFromDefault();
            const client = kc.makeApiClient(CustomObjectsApi);
            // Server-side apply.
            if (ctx.input.namespaced) {
                await client.patchNamespacedCustomObject(
                    group,
                    version,
                    obj.metadata.namespace,
                    plural,
                    obj.metadata.name,
                    obj,
                    undefined,
                    'backstage',
                    true,
                    {headers: {'Content-Type': 'application/apply-patch+yaml'}}
                ).then(
                    (resp) => {
                        ctx.logger.info(
                            `Successfully created ${obj.metadata.namespace}/${obj.metadata.name} Application: HTTP ${resp.response.statusCode}`
                        );
                    },
                    (err) => {
                        ctx.logger.error(
                            `Failed to make PATCH call for ${obj.metadata.namespace}/${obj.metadata.name} Application: Body ${JSON.stringify(err.body, null, 2)} Response ${JSON.stringify(err.response, null, 2)}.`
                        );
                        throw err;
                    }
                )
                return;
            }
            await client.patchClusterCustomObject(
                group,
                version,
                plural,
                obj.metadata.name,
                obj,
                undefined,
                'backstage',
                true,
                {headers: {'Content-Type': 'application/apply-patch+yaml'}}
            ).then(
                (resp) => {
                    ctx.logger.info(
                        `Successfully created ${obj.metadata.name} Application: HTTP ${resp.response.statusCode}`
                    );
                },
                (err) => {
                    ctx.logger.error(
                        `Failed to make PATCH call for ${obj.metadata.name} Application: Body ${JSON.stringify(err.body, null, 2)} Response ${JSON.stringify(err.response, null, 2)}.`
                    );
                    throw err;
                }
            )
        },
    });
};
