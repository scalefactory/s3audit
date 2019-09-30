import {Command, flags} from '@oclif/command'
import * as Config from '@oclif/config';
import {S3} from 'aws-sdk'

const Listr = require('listr')

class S3Audit extends Command {
  static description = 'describe the command here'

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
  }

  private s3: S3;

  constructor(argv: string[], config: Config.IConfig) {
    super(argv, config);

    this.s3 = new S3();
  }

  async run() {
    const buckets: string[] = []

    this.s3.listBuckets((error: Object, data?: S3.Types.ListBucketsOutput) => {
      if (!data || typeof data.Buckets === 'undefined') {
        return this.exit();
      }

      data.Buckets.forEach(bucket => {
        if (typeof bucket.Name !== 'undefined') {
          buckets.push(bucket.Name);
        }
      });

      this.auditBuckets(buckets);
    })
  }

  private async auditBuckets(buckets: Array<string>) {
    const tasks = new Listr([], {
      exitOnError: false,
      collapse: false,
      concurrent: true
    });

    buckets.forEach(bucketName => {
      tasks.add([
        {
          title: bucketName,
          task: () => {
            return new Listr([
              {
                title: 'Bucket public access is blocked',
                task: () => this.checkBucketPublicAccess(bucketName)
              },
              {
                title: 'Server side encryption is enabled',
                task: () => this.checkEncryptionIsEnabled(bucketName)
              },
              {
                title: 'Bucket versioning is enabled',
                task: () => this.checkBucketVersioning(bucketName)
              },
              {
                title: 'Bucket website is disabled',
                task: () => this.checkBucketWebsite(bucketName)
              }
            ], {concurrent: true, exitOnError: false});
          }
        }
      ]);
    });

    tasks.run().catch((err: any) => {});
  }

  private async checkBucketPublicAccess(bucketName: string) {
    return new Promise((resolve, reject) => {
      this.s3.getPublicAccessBlock({Bucket: bucketName}, (error: Object, data: S3.Types.GetPublicAccessBlockOutput) => {
        if (data === null) {
          return reject();
        }

        const publicAccessBlockConfiguration = data.PublicAccessBlockConfiguration || {};

        resolve(new Listr([
          {
            title: 'BlockPublicAcls',
            task: () => {
              if (publicAccessBlockConfiguration.BlockPublicAcls !== true) {
                throw new Error();
              }
            }
          },
          {
            title: 'IgnorePublicAcls',
            task: () => {
              if (publicAccessBlockConfiguration.IgnorePublicAcls !== true) {
                throw new Error();
              }
            }
          },
          {
            title: 'BlockPublicPolicy',
            task: () => {
              if (publicAccessBlockConfiguration.BlockPublicPolicy !== true) {
                throw new Error();
              }
            }
          },
          {
            title: 'RestrictPublicBuckets',
            task: () => {
              if (publicAccessBlockConfiguration.RestrictPublicBuckets !== true) {
                throw new Error();
              }
            }
          }
        ], {concurrent: true, exitOnError: false}));
      })
    })
  }

  private async checkEncryptionIsEnabled(bucketName: string) {
    return new Promise((resolve, reject) => {
      this.s3.getBucketEncryption({Bucket: bucketName}, (error: Object, data: S3.Types.GetBucketEncryptionOutput) => {
        if (data === null || data.ServerSideEncryptionConfiguration === undefined || data.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault === undefined) {
          return reject();
        }

        const algorithm = data.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm;

        resolve(`Bucket encryption algorithm is: ${algorithm}`);
      })
    })
  }

  private async checkBucketVersioning(bucketName: string) {
    return new Promise((resolve, reject) => {
      this.s3.getBucketVersioning({Bucket: bucketName}, (error: Object, data: S3.Types.GetBucketVersioningOutput) => {
        if (data === null || data.Status !== 'Enabled') {
          return reject();
        }
      })
    })
  }

  private async checkBucketWebsite(bucketName: string) {
    return new Promise((resolve, reject) => {
      this.s3.getBucketWebsite({Bucket: bucketName}, (error: Object, data: S3.Types.GetBucketWebsiteOutput) => {
        if (data === null) {
          return resolve();
        }

        reject(new Error('Bucket has static website hosting enabled'))
      })
    })
  }
}

export = S3Audit