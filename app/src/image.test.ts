import { expect, test } from 'vitest'
import { READ_SIDE, sizeForReading } from './image'

test('a big phone photo is shrunk so its longest side is the reading size', () => {
  expect(sizeForReading(4032, 3024, READ_SIDE)).toEqual({ width: 3000, height: 2250 })
})

test('a tall photo is sized by its height', () => {
  expect(sizeForReading(3024, 4032, READ_SIDE)).toEqual({ width: 2250, height: 3000 })
})

test('a small picture is blown up, so small print is easier to read', () => {
  expect(sizeForReading(1427, 1794, READ_SIDE)).toEqual({ width: 2386, height: 3000 })
})

test('a picture exactly at the reading size is left alone', () => {
  expect(sizeForReading(3000, 1000, READ_SIDE)).toEqual({ width: 3000, height: 1000 })
})
