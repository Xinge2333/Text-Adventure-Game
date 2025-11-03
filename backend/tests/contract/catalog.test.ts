import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const schemasDir = path.resolve(__dirname, '../../../specs/001-speckit-specify-wechat/contracts');

const loadSchema = (name: string) => {
  const raw = fs.readFileSync(path.join(schemasDir, name), 'utf8');
  return JSON.parse(raw);
};

describe('Catalog contract', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const api = loadSchema('catalog.openapi.json');

  it('supports keyword and tag filters in request schema', () => {
    const parameters = api.paths['/themes'].get.parameters;
    const queryNames = parameters.map((param: any) => param.name);
    expect(queryNames).toEqual(expect.arrayContaining(['q', 'tag', 'favorites']));
  });

  it('validates theme entry shape including favorites flag', () => {
    const themeSchema = api.components.schemas.Theme;
    const validate = ajv.compile(themeSchema);
    expect(
      validate({
        themeId: 'cyber-detective',
        title: '科技侦探',
        description: '未来都市案件',
        tags: ['科幻'],
        lastUpdated: '2025-10-13T00:00:00Z',
        isFavorite: true
      })
    ).toBe(true);

    expect(
      validate({
        themeId: 'missing-fields'
      })
    ).toBe(false);
  });
});
