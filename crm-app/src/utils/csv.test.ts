import { csvField, toCsv } from '@/utils/csv'

describe('csv', () => {
  it('quotes fields with commas, quotes and line breaks', () => {
    expect(csvField('Acme, Inc')).toBe('"Acme, Inc"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('a\nb')).toBe('"a\nb"')
  })

  it('leaves numbers alone and blanks null and undefined', () => {
    expect(csvField(-12.5)).toBe('-12.5')
    expect(csvField(null)).toBe('')
    expect(csvField(undefined)).toBe('')
  })

  it('stops text being run as a spreadsheet formula', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('+1')).toBe("'+1")
    expect(csvField('@sum')).toBe("'@sum")
  })

  it('joins rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 1],
        ['b', null],
      ]),
    ).toBe('a,1\r\nb,')
  })
})
