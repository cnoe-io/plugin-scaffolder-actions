import {
    createTemplateAction,
    executeShellCommand,
} from '@backstage/plugin-scaffolder-backend';
import commandExists from 'command-exists';
import {Writable} from 'stream';

class ConsoleLogStream extends Writable {
    data: string;

    constructor(options: any) {
        super(options);
        this.data = '';
    }

    _write(chunk: any, _: any, callback: any) {
        this.data += chunk.toString();  // Convert the chunk to a string and append it to this.data
        console.log(this.data)
        callback();
    }
}

export const verifyDependency = () => {
    return createTemplateAction<{
        verifiers: string[];
    }>({
        id: 'cnoe:verify:dependency',
        schema: {
            input: {
                type: 'object',
                required: ['verifiers'],
                properties: {
                    verifiers: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        title: 'verifiers',
                        description: 'The list of verifiers',
                    },
                },
            },
        },
        async handler(ctx) {
            const verifiers = ctx.input.verifiers

            if (verifiers == null || verifiers.length == 0) {
                ctx.logger.error('no verifier was supplied for the object')
                return
            }

            const baseCommand = 'cnoe-embed'
            const baseArguments = ['k8s', 'verify']
            const commandExistsToRun = await commandExists(baseCommand)

            verifiers.forEach((verifier: string) => baseArguments.push("--config", verifier))

            console.log(baseArguments)
            if (!commandExistsToRun) {
                throw new Error("cnoe command is missing")
            }

            var logStream = new ConsoleLogStream({});
            await executeShellCommand({
                command: baseCommand,
                args: baseArguments,
                logStream: logStream,
            }).then(() =>
                ctx.logger.info("verification succeeded")
            ).catch((error) => {
                ctx.logger.error(error)
                throw new Error(logStream.data)
            });
        },
    });
};

