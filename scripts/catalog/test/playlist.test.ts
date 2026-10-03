import { describe, it, expect } from 'vitest'
import { listAvailableVideos } from '../src/playlist'

describe('listAvailableVideos', () => {
  it('conserva los videos normales', () => {
    expect(listAvailableVideos([{ id: 'abc', title: 'Pokemon X/Y - Route 1' }])).toEqual([
      { youtubeId: 'abc', title: 'Pokemon X/Y - Route 1' },
    ])
  })

  it('descarta videos privados, borrados, sin titulo o sin id', () => {
    expect(
      listAvailableVideos([
        { id: 'a', title: '[Private video]' },
        { id: 'b', title: '[Deleted video]' },
        { id: 'c', title: '  ' },
        { id: 'd' },
        { title: 'sin id' },
        { id: 'ok', title: 'Bueno' },
      ]),
    ).toEqual([{ youtubeId: 'ok', title: 'Bueno' }])
  })
})
