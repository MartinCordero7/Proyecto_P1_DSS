const { ResultsService } = require('../../src/services/results.service');
const { registerAnalysisModules } = require('../../src/bootstrap/registerModules');

describe('ResultsService', () => {
  it('requires both findById and save on the repository', () => {
    const service = new ResultsService();

    expect(() => service.registerRepository(null)).toThrow();
    expect(() => service.registerRepository({ findById: async () => null })).toThrow(/save/);
    expect(() => service.registerRepository({ save: async () => ({}) })).toThrow(/findById/);
    expect(() =>
      service.registerRepository({ findById: async () => null, save: async () => ({}) })
    ).not.toThrow();
  });

  it('delegates saveResult and getResultById to the registered repository', async () => {
    const service = new ResultsService();
    const repository = {
      save: jest.fn().mockResolvedValue({ analysis_id: 'a1' }),
      findById: jest.fn().mockResolvedValue({ analysis_id: 'a1' })
    };
    service.registerRepository(repository);

    await expect(service.saveResult({ analysis_id: 'a1' })).resolves.toEqual({ analysis_id: 'a1' });
    await expect(service.getResultById('a1')).resolves.toEqual({ analysis_id: 'a1' });
    expect(repository.save).toHaveBeenCalledWith({ analysis_id: 'a1' });
    expect(repository.findById).toHaveBeenCalledWith('a1');
  });

  it('refuses to save (501) when no repository is connected', async () => {
    await expect(new ResultsService().saveResult({})).rejects.toMatchObject({
      statusCode: 501,
      code: 'REPOSITORY_NOT_IMPLEMENTED'
    });
  });
});

describe('registerAnalysisModules', () => {
  it('connects the engine and the repository to their services', () => {
    const engineService = { registerEngine: jest.fn() };
    const results = { registerRepository: jest.fn() };
    const engine = { analyze: jest.fn() };
    const repository = { findById: jest.fn(), save: jest.fn() };

    registerAnalysisModules({ engineService, results, engine, repository });

    expect(engineService.registerEngine).toHaveBeenCalledWith(engine);
    expect(results.registerRepository).toHaveBeenCalledWith(repository);
  });

  it('wires the real engine and repository into services that accept them', () => {
    const { SteganographyEngineService } = require('../../src/services/steganographyEngine.service');
    const engineService = new SteganographyEngineService();
    const results = new ResultsService();

    expect(() => registerAnalysisModules({ engineService, results })).not.toThrow();
    expect(engineService.engineImplementation).toBeTruthy();
    expect(results.repository).toBeTruthy();
  });
});
