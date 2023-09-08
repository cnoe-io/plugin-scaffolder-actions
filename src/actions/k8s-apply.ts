import {
    ActionContext,
    createTemplateAction,
} from '@backstage/plugin-scaffolder-node';
import {
    KubeConfig,
    CustomObjectsApi,
    CoreV1Api,
} from '@kubernetes/client-node';
import YAML from 'yaml';
import { Config } from '@backstage/config';
import { resolveSafeChildPath } from '@backstage/backend-common';
import fs from 'fs-extra';

export const createKubernetesApply = (config: Config) => {
    return createTemplateAction<{
        manifestString?: string;
        manifestObject?: any;
        manifestPath?: string;
        namespaced: boolean;
        clusterName?: string;
    }>({
        id: 'cnoe:kubernetes:apply',
        schema: {
            input: {
                type: 'object',
                required: ['namespaced'],
                properties: {
                    manifestString: {
                        type: 'string',
                        title: 'Manifest',
                        description:
                          'The manifest to apply in the cluster. Must be a string',
                    },
                    manifestObject: {
                        type: 'object',
                        title: 'Manifest',
                        description:
                          'The manifest to apply in the cluster. Must be an object',
                    },
                    manifestPath: {
                        type: 'string',
                        title: 'Path to the manifest file',
                        description: 'The path to the manifest file.',
                    },
                    namespaced: {
                        type: 'boolean',
                        title: 'Namespaced',
                        description: 'Whether the API is namespaced or not',
                    },
                    clusterName: {
                        type: 'string',
                        title: 'Cluster Name',
                        description: 'The name of the cluster to apply this',
                    },
                },
            },
            output: {
                type: 'object',
                title: 'Returned object',
                description:
                  'The object returned by Kubernetes by performing this operation',
            },
        },
        async handler(ctx) {
            let obj: any;
            if (ctx.input.manifestString) {
                obj = YAML.parse(ctx.input.manifestString);
            } else if (ctx.input.manifestObject) {
                obj = ctx.input.manifestObject;
            } else {
                const filePath = resolveSafeChildPath(
                  ctx.workspacePath,
                  ctx.input.manifestPath!,
                );
                const fileContent = fs.readFileSync(filePath, 'utf8');
                obj = YAML.parse(fileContent);
            }
            const words = obj.apiVersion.split('/');
            const group = words[0];
            const version = words[1];

            // hack. needs fixing to correctly extract the plurals
            const plural = `${obj.kind.toLowerCase()}s`;
            const kc = new KubeConfig();
            if (ctx.input.clusterName) {
                // Supports SA token authentication only
                const targetCluster = getClusterConfig(ctx.input.clusterName!, config);
                kc.addCluster({
                    name: targetCluster.getString('name'),
                    caData: targetCluster.getString('caData'),
                    server: targetCluster.getString('url'),
                    skipTLSVerify: targetCluster.getBoolean('skipTLSVerify'),
                });
                kc.addUser({
                    name: 'scaffolder-user',
                    token: targetCluster.getString('serviceAccountToken'),
                });
                kc.addContext({
                    cluster: ctx.input.clusterName,
                    user: 'scaffolder-user',
                    name: ctx.input.clusterName,
                });
                kc.setCurrentContext(ctx.input.clusterName);
            } else {
                kc.loadFromDefault();
            }

            if (version === undefined) {
                return await handleCoreObjects(ctx, obj, kc);
            }

            const client = kc.makeApiClient(CustomObjectsApi);
            // Server-side apply.
            if (ctx.input.namespaced) {
                await client
                  .patchNamespacedCustomObject(
                    group,
                    version,
                    obj.metadata.namespace,
                    plural,
                    obj.metadata.name,
                    obj,
                    undefined,
                    'backstage',
                    true,
                    { headers: { 'Content-Type': 'application/apply-patch+yaml' } },
                  )
                  .then(
                    resp => {
                        ctx.logger.info(
                          `Successfully created ${obj.metadata.namespace}/${obj.metadata.name} Application: HTTP ${resp.response.statusCode}`,
                        );
                        return resp.body;
                    },
                    err => {
                        ctx.logger.error(
                          `Failed to make PATCH call for ${obj.metadata.namespace}/${
                            obj.metadata.name
                          } Application: Body ${JSON.stringify(err.body, null, 2)}`,
                        );
                        throw err;
                    },
                  );
            }
            await client
              .patchClusterCustomObject(
                group,
                version,
                plural,
                obj.metadata.name,
                obj,
                undefined,
                'backstage',
                true,
                { headers: { 'Content-Type': 'application/apply-patch+yaml' } },
              )
              .then(
                resp => {
                    ctx.logger.info(
                      `Successfully created ${obj.metadata.name} Application: HTTP ${resp.response.statusCode}`,
                    );
                    return resp.body;
                },
                err => {
                    ctx.logger.error(
                      `Failed to make PATCH call for ${
                        obj.metadata.name
                      } Application: Body ${JSON.stringify(
                        err.body,
                        null,
                        2,
                      )} Response ${JSON.stringify(err.response, null, 2)}.`,
                    );
                    throw err;
                },
              );
            return {};
        },
    });
};

// Finds the first cluster that matches the given name.
function getClusterConfig(name: string, config: Config): Config {
    const clusterConfigs = config
      .getConfigArray('kubernetes.clusterLocatorMethods')
      .filter((val: Config) => {
          return val.getString('type') === 'config';
      });

    const clusters = new Array<Config>();
    clusterConfigs.filter((conf: Config) => {
        const cluster = conf.getConfigArray('clusters').find((val: Config) => {
            return val.getString('name') === name;
        });
        if (cluster) {
            clusters.push(cluster);
        }
    });

    if (clusters.length === 0) {
        throw new Error(`Cluster with name ${name} not found`);
    }
    return clusters[0];
}

async function handleCoreObjects(
  ctx: ActionContext<any>,
  obj: any,
  kc: KubeConfig,
): Promise<any> {
    ctx.logger.info(`processing core object of kind ${obj.kind}`);
    const client = kc.makeApiClient(CoreV1Api);
    const opts = { headers: { 'Content-Type': 'application/apply-patch+yaml' } };
    switch (obj.kind) {
        case 'ConfigMap': {
            const resp = await client.patchNamespacedConfigMap(
              obj.metadata.name,
              obj.metadata.namespace,
              obj,
              undefined,
              undefined,
              'backstage',
              undefined,
              true,
              opts,
            );
            return resp.body;
        }
        default: {
            throw Error(`kind ${obj.kind} is not supported`);
        }
    }
}
