/* eslint-env jest */
'use strict'
import AlpheiosLexAdapter from '../../src/alpheios/alpheios_adapter.js'
let lsj = 'https://github.com/alpheios-project/lsj'

describe('BaseAdapter object', () => {
  beforeAll(() => {
    jest.resetModules()
    window.fetch = require('jest-fetch-mock')
  })

  test('default config', () => {
    let adapter = new AlpheiosLexAdapter(lsj)
    expect(adapter.getConfig('urls').short).toBeTruthy()
  })

  test('default config', () => {
    let adapter = new AlpheiosLexAdapter(lsj, {urls: {short: 'dummyurl'}})
    expect(adapter.getConfig('urls').short).toEqual('dummyurl')
  })

  test('get lexicons', () => {
    let latin = AlpheiosLexAdapter.getLexicons('lat')
    expect(latin.size).toEqual(1)
    console.log(latin)
    expect(latin.get('https://github.com/alpheios-project/ls')).toBeTruthy()
  })

  test('getShortDef', async () => {
    let mockLemma = {
      word: 'mare',
      language: 'lat',
      principalParts: []
    }
    let mockDefinition = 'short definition'
    let adapter = new AlpheiosLexAdapter(lsj)
    let dummyResponse = `mare|${mockDefinition}`
    window.fetch.mockResponse(dummyResponse)
    let response = await adapter.lookupShortDef(mockLemma)
    expect(response.text).toEqual(mockDefinition)
    expect(response.provider.toString()).toMatch(/Liddell/)
  })

  test('getFullDef', async () => {
    let mockLemma = {
      word: 'mare',
      language: 'lat',
      principalParts: []
    }
    let adapter = new AlpheiosLexAdapter(lsj)
    let dummyResponse = '<div n="abc">my def</div>'
    window.fetch.mockResponse(dummyResponse)
    let response = await adapter.lookupFullDef(mockLemma)
    expect(response.text).toEqual(dummyResponse)
  })

  test('load data', async () => {
    let mockLemma = {
      word: 'mare',
      language: 'lat',
      principalParts: []
    }
    let adapter = new AlpheiosLexAdapter(lsj)
    let dummyResponse = {'foo': 'bar'}
    window.fetch.mockResponse(JSON.stringify(dummyResponse))
    await adapter.lookupShortDef(mockLemma)
    expect(adapter.data).toBeTruthy()
  })

  test('lookup enforced capital', async () => {
    let mock = {
      word: 'Εὐκράς',
      language: 'grc',
      principalParts: []
    }
    let mock2 = {
      word: 'εὐκτέανος2',
      language: 'grc',
      principalParts: []
    }
    let mock3 = {
      word: 'nontrailing1',
      language: 'grc',
      principalParts: []
    }
    let adapter = new AlpheiosLexAdapter(lsj)
    let dummyResponse = '@Εὐκράς|n44301\n@εὐκτέανος1|n44329\n@εὐκτέανος2|n44330\nεὐκράς1|@\nεὐκράς2|@\nεὐκράς|@\nεὐκτέανος2|@\nnontrailing|n99999'
    expect.assertions(3)
    window.fetch.mockResponse(dummyResponse)
    let response = await adapter.lookupShortDef(mock)
    expect(response.text).toEqual('n44301')
    let response2 = await adapter.lookupShortDef(mock2)
    expect(response2.text).toEqual('n44330')
    let response3 = await adapter.lookupShortDef(mock3)
    expect(response3.text).toEqual('n99999')
  })

  test('lookup data with alternatives', () => {
    let mockLemma = {
      word: 'mare',
      language: 'lat',
      principalParts: []
    }
    let mockData = new Map([['more', 'n2']])
    let mockModel = {
      alternateWordEncodings: jest.fn(() => ['more'])
    }
    let adapter = new AlpheiosLexAdapter(lsj)
    let found = adapter._lookupInDataIndex(mockData, mockLemma, mockModel)
    expect(found).toEqual('n2')
  })

  test('lookup data with alternatives and principal parts', () => {
    let mockLemma = {
      word: 'mare',
      language: 'lat',
      principalParts: ['mere']
    }
    let mockData = new Map([['mere', 'n1'], ['more', 'n2']])
    let mockModel = {
      alternateWordEncodings: jest.fn(() => ['more'])
    }
    let adapter = new AlpheiosLexAdapter(lsj)
    let found = adapter._lookupInDataIndex(mockData, mockLemma, mockModel)
    expect(found).toEqual('n1')
  })
})
