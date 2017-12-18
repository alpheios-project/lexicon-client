import {LanguageModelFactory} from 'alpheios-data-models'
import AlpheiosLexAdapter from './alpheios/alpheios_adapter'

export default class Lexicons {
  /**
   * Default request parameters
   * @return {{timeout: number}}
   */
  static get defaults () {
    return {
      timeout: 0 // If zero, no timeout will be used
    }
  }

  /**
   * A short definition request wrapper. See fetchFullDefs for more details.
   * @param lemma
   * @param options
   * @return {Promise[]}
   */
  static fetchShortDefs (lemma, options = {}) {
    return Lexicons.fetchDefinitions(lemma, options, 'lookupShortDef')
  }

  /**
   * A full definition request wrapper. See fetchFullDefs for more details.
   * @param lemma
   * @param options
   * @return {Promise[]}
   */
  static fetchFullDefs (lemma, options = {}) {
    return Lexicons.fetchDefinitions(lemma, options, 'lookupFullDef')
  }

  /**
   * Send requests to either short of full definitions depending on the `lookupFunction` value.
   * @param {Lemma} lemma - A lemma we need definitions for.
   * @param {Object} requestOptions - With what options run a request.
   * @param {String} lookupFunction - A name of an adapter lookup function to use for a request.
   * @return {Promise[]} Array of Promises, one for each request. They will be either fulfilled with
   * a Definition object or resolved with an error if request cannot be made/failed/timeout expired.
   */
  static fetchDefinitions (lemma, requestOptions, lookupFunction) {
    let options = Object.assign(Lexicons.defaults, requestOptions)

    let requests = []
    try {
      let adapters = Lexicons.getLexiconAdapters(lemma.languageID)
      if (!adapters || adapters.length === 0) { return [] } // No adapters found for this language
      requests = adapters.map(adapter => {
        console.log(`Preparing a request to "${adapter.config.description}"`)
        return new Promise((resolve, reject) => {
          let timeout = 0
          if (options.timeout > 0) {
            timeout = window.setTimeout(() => {
              reject(new Error(`Timeout of ${options.timeout} ms has been expired for a request to "${adapter.config.description}"`))
            }, options.timeout)
          }

          try {
            adapter[lookupFunction](lemma)
              .then(value => {
                console.log(`A definition object has been returned from "${adapter.config.description}"`, value)
                if (timeout) { window.clearTimeout(timeout) }
                // value is a Definition object wrapped in a Proxy
                resolve(value)
              }).catch(error => {
                if (timeout) { window.clearTimeout(timeout) }
                reject(error)
              })
          } catch (error) {
            reject(error)
          }
        })
      })

      return requests
    } catch (error) {
      console.log(`Unable to fetch full definitions due to: ${error}`)
      return []
    }
  }

  /**
   * Returns a list of suitable lexicon adapters for a given language ID.
   * @param {Symbol} languageID - A language ID of adapters returned.
   * @return {BaseLexiconAdapter[]} An array of lexicon adapters for a given language.
   */
  static getLexiconAdapters (languageID) {
    // As getLexicons need a language code, let's convert a language ID to a code
    let languageCode = LanguageModelFactory.getLanguageCodeFromId(languageID)

    let lexicons = AlpheiosLexAdapter.getLexicons(languageCode)
    return Array.from(lexicons.keys()).map(id => new AlpheiosLexAdapter(id))
  }
}
