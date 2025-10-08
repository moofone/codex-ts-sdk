import type { MockDataGeneratorConfig, MockDataRequest, WebsiteDataResult, WebsiteExportFormat } from '../types/monitoring';
export declare class MockDataGenerator {
    private readonly config;
    private rng;
    constructor(config?: MockDataGeneratorConfig);
    generateMockData(request: MockDataRequest): Promise<WebsiteExportFormat>;
    generateWebsiteData(request: MockDataRequest & {
        outputPath?: string;
    }): Promise<WebsiteDataResult>;
    private generateValue;
}
