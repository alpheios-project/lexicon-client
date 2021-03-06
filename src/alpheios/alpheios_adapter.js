import BaseLexiconAdapter from '../base_adapter.js'
import papaparse from 'papaparse'
import { Definition, ResourceProvider, LanguageModelFactory } from 'alpheios-data-models'
import DefaultConfig from './config.json'

import axios from 'axios'

class AlpheiosLexAdapter extends BaseLexiconAdapter {
  /**
   * A Client Adapter for the Alpheios V1 Lexicon service
   * @constructor
   * @param {string} lexid - the idenitifer code for the lexicon this instance
   *                         provides access to
   * @param {Object} config - JSON configuration object override
   */
  constructor (lexid = null, config = null) {
    super()
    this.lexid = lexid
    this.data = null
    this.index = null
    // this is a bit of a hack to enable inclusion of a JSON config file
    // in a way that works both pre and post-rollup. Our rollup config
    // will stringify the file and then we can parse it but if we want to
    // run unit tests on pre-rolled up code, then we need to have a fallback
    // which works with the raw ES6 import
    if (config == null) {
      try {
        let fullconfig = JSON.parse(DefaultConfig)
        this.config = fullconfig[lexid]
      } catch (e) {
        this.config = DefaultConfig[lexid]
      }
    } else {
      this.config = config
    }
    this.provider = new ResourceProvider(this.lexid, this.config.rights)
  }

  fetchFullDefWindow (requests, lemma) {
    let targetLanguage = this.getConfig('langs').target
    let promises = []
    for (let r of requests) {
      let p = new Promise((resolve, reject) => {
        window.fetch(r).then(
          function (response) {
            let text = response.text()
            resolve(text)
          }
        ).catch((error) => {
          reject(error)
        })
      }).then((result) => {
        if (result.match(/No entries found/)) {
          throw new Error('Not Found')
        } else {
          let def = new Definition(result, targetLanguage, 'text/html', lemma.word)
          return ResourceProvider.getProxy(this.provider, def)
        }
      })
      promises.push(p)
    }
    return Promise.all(promises).then(
      values => {
        return values.filter(value => { return value })
      },
      error => {
        console.log(error)
        throw (error)
        // quietly fail?
      }
    )
  }

  async fetchFullDefAxios (requests, lemma) {
    let targetLanguage = this.getConfig('langs').target
    let values = []
    for (let url of requests) {
      try {
        let response = await axios.get(encodeURI(url))
        let result = response.data

        if (result.match(/No entries found/)) {
          throw new Error('Not Found')
        } else {
          let def = new Definition(result, targetLanguage, 'text/html', lemma.word)

          ResourceProvider.getProxy(this.provider, def)
          values.push(def)
        }
      } catch (err) {
        console.error('Error with request ', url, err.message)
      }
    }
    return values
  }
  /**
   * @override BaseLexiconAdapter#lookupFullDef
   */
  async lookupFullDef (lemma = null) {
    // TODO figure out the best way to handle initial reading of the data file
    if (this.index === null && this.getConfig('urls').index) {
      let url = this.getConfig('urls').index
      let unparsed = await this._loadData(url)
      let parsed = papaparse.parse(unparsed, {})
      this.index = this._fillMap(parsed.data)
    }
    let ids
    if (this.index) {
      let model = LanguageModelFactory.getLanguageModel(lemma.languageID)
      ids = this._lookupInDataIndex(this.index, lemma, model)
    }

    let url = this.getConfig('urls').full
    if (!url) {
      console.error(`URL data is not available`)
      return
    }
    let requests = []
    if (ids) {
      for (let id of ids) {
        requests.push(`${url}&n=${id}`)
      }
    } else {
      requests.push(`${url}&l=${lemma.word}`)
    }
    if (typeof window !== 'undefined') {
      return this.fetchFullDefWindow(requests, lemma)
    } else {
      return this.fetchFullDefAxios(requests, lemma)
    }
  }

  /**
   * @override BaseLexiconAdapter#lookupShortDef
   */
  async lookupShortDef (lemma = null) {
    let url = this.getConfig('urls').short
    let promises = []
    if (!url) {
      console.log(`URL data is not available`)
    } else {
      if (this.data === null) {
        let unparsed = await this._loadData(url)
        // the PapaParse algorigthm doesn't deal well with fields with start with data
        // in quotes but doesn't use quotes to enclose the entire field contents.
        // eg. a row like
        //   lemma|"some def" and more def.
        // throws it off. Since these data files don't contain quoted
        // fields just use a non-printable unicode char as the quoteChar
        // (i.e. one which is unlikely to appear in the data) as the
        // in the papaparse config to prevent it from doing this
        let parsed = papaparse.parse(unparsed, { quoteChar: '\u{0000}', delimiter: '|' })
        this.data = this._fillMap(parsed.data)
      }
      let model = LanguageModelFactory.getLanguageModel(lemma.languageID)
      let deftexts = this._lookupInDataIndex(this.data, lemma, model)
      if (deftexts) {
        for (let d of deftexts) {
          promises.push(new Promise((resolve, reject) => {
            let def = new Definition(d, this.getConfig('langs').target, 'text/plain', lemma.word)
            resolve(ResourceProvider.getProxy(this.provider, def))
          }))
        }
      } else {
        promises.push(new Promise((resolve, reject) => {
          reject(new Error('Not Found'))
        }
        ))
      }
    }
    return Promise.all(promises).then(
      values => {
        return values.filter(value => { return value })
      },
      error => {
        throw (error)
      }
    )
  }

  /**
   * Lookup a Lemma object in an Alpheios v1 data index
   * @param {Map} data the data inddex
   * @param {Lemma} lemma the lemma to lookupInDataIndex
   * @param {LanguageModel} model a language model for language specific methods
   * @return {string} the index entry as a text string
   */
  _lookupInDataIndex (data, lemma, model) {
    // legacy behavior from Alpheios lemma data file indices
    // first look to see if we explicitly have an instance of this lemma
    // with capitalization retained
    let found

    let alternatives = []
    let altEncodings = []
    for (let l of [lemma.word, ...lemma.principalParts]) {
      alternatives.push(l)
      for (let a of model.alternateWordEncodings(l)) {
        // we gather altEncodings separately because they should
        // be tried last after the lemma and principalParts in their
        // original form
        altEncodings.push(a)
      }
      let nosense = l.replace(/_?\d+$/, '')
      if (l !== nosense) {
        alternatives.push(nosense)
      }
    }
    alternatives = [...alternatives, ...altEncodings]

    for (let lookup of alternatives) {
      found = data.get(lookup.toLocaleLowerCase())
      if (found && found.length === 1 && found[0] === '@') {
        found = data.get(`@${lookup}`)
      }
      if (found) {
        break
      }
    }
    return found
  }

  fetchWindow (url) {
    return new Promise((resolve, reject) => {
      window.fetch(url).then(
        function (response) {
          let text = response.text()
          resolve(text)
        }
      ).catch((error) => {
        reject(error)
      })
    })
  }

  async fetchAxios (url) {
    let res = await axios.get(encodeURI(url))
    return res.data
  }

  /**
   * Loads a data file from a URL
   * @param {string} url - the url of the file
   * @returns {Promise} a Promise that resolves to the text contents of the loaded file
   */
  _loadData (url) {
    // TODO figure out best way to load this data
    if (typeof window !== 'undefined') {
      return this.fetchWindow(url)
    } else {
      return this.fetchAxios(url)
    }
  }

  /**
   * fills the data map with the rows from the parsed file
   * we need a method to do this because there may be homonyms in
   * the files
   * @param {string[]} rows
   * @return {Map} the filled map
   */
  _fillMap (rows) {
    let data = new Map()
    for (let row of rows) {
      if (data.has(row[0])) {
        data.get(row[0]).push(row[1])
      } else {
        data.set(row[0], [ row[1] ])
      }
    }
    return data
  }

  /**
   * Get a configuration setting for this lexicon client instance
   * @param {string} property
   * @returns {string} the value of the property
   */
  getConfig (property) {
    return this.config[property]
  }

  /**
   * @override BaseAdapter#getLexicons
   */
  static getLexicons (language) {
    let fullconfig
    let lexicons = new Map()
    try {
      fullconfig = JSON.parse(DefaultConfig)
    } catch (e) {
      fullconfig = DefaultConfig
    }
    for (let l of Object.keys(fullconfig)) {
      if (fullconfig[l].langs.source === language) {
        lexicons.set(l, fullconfig[l].description)
      }
    }
    return lexicons
  }
}
export default AlpheiosLexAdapter
