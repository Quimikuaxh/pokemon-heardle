export interface ClipStore { getCatalog(): Promise<unknown>; getClip(clipKey: string, n: number): Promise<Buffer> }
