/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ConfigReader } from '@backstage/config';
import {
  BitbucketServerIntegration,
  readBitbucketServerIntegrationConfig,
} from '@backstage/integration';
import { setupRequestMockHandlers } from '@backstage/backend-test-utils';
import fs from 'fs-extra';
import mockFs from 'mock-fs';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import os from 'os';
import path from 'path';
import { NotModifiedError } from '@backstage/errors';
import { BitbucketServerUrlReader } from './BitbucketServerUrlReader';
import { DefaultReadTreeResponseFactory } from './tree';

const treeResponseFactory = DefaultReadTreeResponseFactory.create({
  config: new ConfigReader({}),
});

const reader = new BitbucketServerUrlReader(
  new BitbucketServerIntegration(
    readBitbucketServerIntegrationConfig(
      new ConfigReader({
        host: 'bitbucket.mycompany.net',
        apiBaseUrl: 'https://api.bitbucket.mycompany.net/rest/api/1.0',
      }),
    ),
  ),
  { treeResponseFactory },
);

const tmpDir = os.platform() === 'win32' ? 'C:\\tmp' : '/tmp';

describe('BitbucketServerUrlReader', () => {
  beforeEach(() => {
    mockFs({
      [tmpDir]: mockFs.directory(),
    });
  });

  afterEach(() => {
    mockFs.restore();
  });

  const worker = setupServer();
  setupRequestMockHandlers(worker);

  describe('readTree', () => {
    const repoBuffer = fs.readFileSync(
      path.resolve(__dirname, '__fixtures__/bitbucket-server-repo.tar.gz'),
    );

    beforeEach(() => {
      worker.use(
        rest.get(
          'https://api.bitbucket.mycompany.net/rest/api/1.0/projects/backstage/repos/mock/archive',
          (_, res, ctx) =>
            res(
              ctx.status(200),
              ctx.set('Content-Type', 'application/zip'),
              ctx.set(
                'content-disposition',
                'attachment; filename=backstage-mock.tgz',
              ),
              ctx.body(repoBuffer),
            ),
        ),
        rest.get(
          'https://api.bitbucket.mycompany.net/rest/api/1.0/projects/backstage/repos/mock/branches',
          (_, res, ctx) =>
            res(
              ctx.status(200),
              ctx.json({
                size: 2,
                values: [
                  {
                    displayId: 'some-branch-that-should-be-ignored',
                    latestCommit: 'bogus hash',
                  },
                  {
                    displayId: 'some-branch',
                    latestCommit: '12ab34cd56ef78gh90ij12kl34mn56op78qr90st',
                  },
                ],
              }),
            ),
        ),
      );
    });

    it('uses private bitbucket host', async () => {
      const response = await reader.readTree(
        'https://bitbucket.mycompany.net/projects/backstage/repos/mock/browse/docs?at=some-branch',
      );

      expect(response.etag).toBe('12ab34cd56ef');

      const files = await response.files();

      expect(files.length).toBe(1);
      const indexMarkdownFile = await files[0].content();

      expect(indexMarkdownFile.toString()).toBe('# Test\n');
    });
  });

  describe('readTree without branch', () => {
    const repoBuffer = fs.readFileSync(
      path.resolve(__dirname, '__fixtures__/bitbucket-server-repo.tar.gz'),
    );

    beforeEach(() => {
      worker.use(
        rest.get(
          'https://api.bitbucket.mycompany.net/rest/api/1.0/projects/backstage/repos/mock/archive',
          (_, res, ctx) =>
            res(
              ctx.status(200),
              ctx.set('Content-Type', 'application/zip'),
              ctx.set(
                'content-disposition',
                'attachment; filename=backstage-mock.tgz',
              ),
              ctx.body(repoBuffer),
            ),
        ),
        rest.get(
          'https://api.bitbucket.mycompany.net/rest/api/1.0/projects/backstage/repos/mock/branches',
          (_, res, ctx) =>
            res(
              ctx.status(200),
              ctx.json({
                size: 2,
                values: [
                  {
                    displayId: 'some-branch-that-should-be-ignored',
                    latestCommit: 'bogus hash',
                  },
                  {
                    displayId: 'some-branch',
                    latestCommit: '12ab34cd56ef78gh90ij12kl34mn56op78qr90st',
                  },
                ],
              }),
            ),
        ),
      );
    });

    it('uses private bitbucket host', async () => {
      const response = await reader.readTree(
        'https://bitbucket.mycompany.net/projects/backstage/repos/mock/browse/docs?at=some-branch',
      );

      expect(response.etag).toBe('12ab34cd56ef');

      const files = await response.files();

      expect(files.length).toBe(1);
      const indexMarkdownFile = await files[0].content();

      expect(indexMarkdownFile.toString()).toBe('# Test\n');
    });
  });

  describe('search private', () => {
    const repoBuffer = fs.readFileSync(
      path.resolve(__dirname, '__fixtures__/bitbucket-server-repo.tar.gz'),
    );

    beforeEach(() => {
      worker.use(
        rest.get(
          'https://api.bitbucket.mycompany.net/rest/api/1.0/projects/backstage/repos/mock/archive',
          (_, res, ctx) =>
            res(
              ctx.status(200),
              ctx.set('Content-Type', 'application/zip'),
              ctx.set(
                'content-disposition',
                'attachment; filename=backstage-mock.tgz',
              ),
              ctx.body(repoBuffer),
            ),
        ),
        rest.get(
          'https://api.bitbucket.mycompany.net/rest/api/1.0/projects/backstage/repos/mock/branches',
          (_, res, ctx) =>
            res(
              ctx.status(200),
              ctx.json({
                size: 2,
                values: [
                  {
                    displayId: 'master-of-none',
                    latestCommit: 'bogus hash',
                  },
                  {
                    displayId: 'master',
                    latestCommit: '12ab34cd56ef78gh90ij12kl34mn56op78qr90st',
                  },
                ],
              }),
            ),
        ),
      );
    });

    it('works for the naive case', async () => {
      const result = await reader.search(
        'https://bitbucket.mycompany.net/projects/backstage/repos/mock/browse/**/index.*?at=master',
      );
      expect(result.etag).toBe('12ab34cd56ef');
      expect(result.files.length).toBe(1);
      expect(result.files[0].url).toBe(
        'https://bitbucket.mycompany.net/projects/backstage/repos/mock/browse/docs/index.md?at=master',
      );
      await expect(result.files[0].content()).resolves.toEqual(
        Buffer.from('# Test\n'),
      );
    });

    it('works in nested folders', async () => {
      const result = await reader.search(
        'https://bitbucket.mycompany.net/projects/backstage/repos/mock/browse/docs/index.*?at=master',
      );
      expect(result.etag).toBe('12ab34cd56ef');
      expect(result.files.length).toBe(1);
      expect(result.files[0].url).toBe(
        'https://bitbucket.mycompany.net/projects/backstage/repos/mock/browse/docs/index.md?at=master',
      );
      await expect(result.files[0].content()).resolves.toEqual(
        Buffer.from('# Test\n'),
      );
    });

    it('throws NotModifiedError when same etag', async () => {
      await expect(
        reader.search(
          'https://bitbucket.mycompany.net/projects/backstage/repos/mock/browse/**/index.*?at=master',
          { etag: '12ab34cd56ef' },
        ),
      ).rejects.toThrow(NotModifiedError);
    });
  });
});
