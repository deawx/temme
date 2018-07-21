import cheerio from 'cheerio'
import invariant from 'invariant'
import { defaultFilterMap, FilterFn, FilterFnMap } from './filters'
import { contentFunctions } from './contentFunctions'
import { checkRootSelector, msg } from './check'
import { CaptureResult } from './CaptureResult'
import { SPECIAL_FILTER_NAMES } from './constants'
import { makeNormalCssSelector, isCheerioStatic, isAttributeQualifier } from './utils'
import {
  Dict,
  TemmeSelector,
  ExpandedTemmeSelector,
  ContentPart,
  AttributeQualifier,
  NormalSelector,
  ParentRefSelector,
  SnippetDefine,
} from './interfaces'

export interface TemmeParser {
  parse(temmeSelectorString: string): TemmeSelector[]
}

/** Prepare the temme-parser.
 * In the webpack building context, we use pegjs-loader to load parser from the grammar file.
 * In other context (e.x. jest context), we use fs and pegjs to generate the parser. */
declare const WEBPACK_BUILD: boolean
let temmeParser: TemmeParser
if (typeof WEBPACK_BUILD !== 'undefined' && WEBPACK_BUILD) {
  temmeParser = require('./grammar.pegjs')
} else {
  const fs = require('fs')
  const pegjs = require('pegjs')
  const source = fs.readFileSync('./src/grammar.pegjs', 'utf8')
  temmeParser = pegjs.generate(source)
}

export { cheerio, temmeParser }

export default function temme(
  html: string | CheerioStatic | CheerioElement,
  selector: string | TemmeSelector[],
  extraFilters: Dict<FilterFn> = {},
) {
  let $: CheerioStatic
  if (typeof html === 'string') {
    $ = cheerio.load(html, { decodeEntities: false })
  } else if (isCheerioStatic(html)) {
    $ = html
  } else {
    $ = cheerio.load(html)
  }

  let rootSelectorArray: TemmeSelector[]
  if (typeof selector === 'string') {
    rootSelectorArray = temmeParser.parse(selector)
  } else {
    rootSelectorArray = selector
  }
  if (rootSelectorArray.length === 0) {
    return null
  }

  rootSelectorArray.forEach(checkRootSelector)

  const filterFnMap: FilterFnMap = Object.assign({}, defaultFilterMap, extraFilters)
  const snippetsMap = new Map<string, SnippetDefine>()

  return helper($.root(), rootSelectorArray).getResult()

  function helper(cntCheerio: Cheerio, selectorArray: TemmeSelector[]): CaptureResult {
    const result = new CaptureResult(filterFnMap)

    // First pass: process SnippetDefine and FilterDefine
    for (const selector of selectorArray) {
      if (selector.type === 'snippet-define') {
        invariant(!snippetsMap.has(selector.name), msg.snippetAlreadyDefined(selector.name))
        snippetsMap.set(selector.name, selector)
      } else if (selector.type === 'filter-define') {
        const { name, argsPart, code } = selector
        invariant(!(name in filterFnMap), msg.filterAlreadyDefined(name))
        const funcString = `(function (${argsPart}) { ${code} })`
        filterFnMap[name] = eval(funcString)
      }
    }

    // Second pass: process match and capture
    for (const selector of expandSnippets(selectorArray)) {
      if (selector.type === 'normal-selector') {
        const cssSelector = makeNormalCssSelector(selector.sections)
        const subCheerio = cntCheerio.find(cssSelector)
        if (subCheerio.length > 0) {
          // Only the first element will be captured.
          result.merge(capture(subCheerio.first(), selector))

          if (selector.arrayCapture) {
            const { name, filterList } = selector.arrayCapture
            const beforeValue = subCheerio
              .toArray()
              .map(sub => helper($(sub), selector.children).getResult())
            result.add(name, beforeValue, filterList)
          }
        } else if (selector.arrayCapture) {
          const { name, filterList } = selector.arrayCapture
          result.add(name, [], filterList)
        }
      } else if (selector.type === 'parent-ref-selector') {
        const cssSelector = makeNormalCssSelector([selector.section])
        if (cntCheerio.is(cssSelector)) {
          result.merge(capture(cntCheerio, selector))
        }
      } else if (selector.type === 'assignment') {
        const { name, filterList } = selector.capture
        result.forceAdd(name, selector.value, filterList)
      } // else selector.type is 'snippet-define' or 'filter-define'. Do nothing.
    }
    return result
  }

  /** Expand snippets recursively.
   * The returned selector array will not contain any `SnippetExpand`.
   * `expanded` is used to detect circular expansion. */
  function expandSnippets(
    selectorArray: TemmeSelector[],
    expanded: string[] = [],
  ): ExpandedTemmeSelector[] {
    const result: ExpandedTemmeSelector[] = []
    for (const selector of selectorArray) {
      if (selector.type === 'snippet-expand') {
        invariant(snippetsMap.has(selector.name), msg.snippetNotDefined(selector.name))
        const snippet = snippetsMap.get(selector.name)
        const nextExpanded = expanded.concat(snippet.name)
        invariant(!expanded.includes(snippet.name), msg.circularSnippetExpansion(nextExpanded))
        const slice = expandSnippets(snippet.selectors, nextExpanded)
        result.push(...slice)
      } else {
        result.push(selector)
      }
    }
    return result
  }

  /** Capture the node according to the selector. Returns an `CaptureResult`. */
  function capture(node: Cheerio, selector: NormalSelector | ParentRefSelector): CaptureResult {
    const result = new CaptureResult(filterFnMap)

    if (selector.type === 'normal-selector') {
      const { sections, content } = selector
      // Value-captures in the last section will be processed.
      // Preceding value-captures will be ignored.
      const { qualifiers } = sections[sections.length - 1]
      result.mergeWithFailPropagation(
        captureAttributes(node, qualifiers.filter(isAttributeQualifier)),
      )
      result.mergeWithFailPropagation(captureContent(node, content))
    } else {
      // selector.type === 'parent-ref-selector'
      const {
        section: { qualifiers },
        content,
      } = selector
      result.mergeWithFailPropagation(
        captureAttributes(node, qualifiers.filter(isAttributeQualifier)),
      )
      result.mergeWithFailPropagation(captureContent(node, content))
    }
    return result
  }

  function captureAttributes(node: Cheerio, attributeQualifiers: AttributeQualifier[]) {
    const result = new CaptureResult(filterFnMap)
    for (const qualifier of attributeQualifiers) {
      if (qualifier.value != null && typeof qualifier.value === 'object') {
        // value-capture
        const {
          attribute,
          value: { name, filterList },
        } = qualifier
        const attributeValue = node.attr(attribute)
        if (attributeValue !== undefined) {
          // capture only when attribute exists
          result.add(name, attributeValue, filterList)
        }
      }
    }
    return result
  }

  function captureContent(node: Cheerio, content: ContentPart[]): CaptureResult {
    const result = new CaptureResult(filterFnMap)
    for (const part of content) {
      if (part.type === 'capture') {
        const {
          capture: { name, filterList },
        } = part
        // `text`, `html` and `node` are three special filter names.
        // They have the same syntax with the normal filters, but have different running semantics.
        const firstFilterName = filterList[0] && filterList[0].name
        let initValue: any
        if (firstFilterName === 'html') {
          initValue = node.html()
        } else if (firstFilterName === 'outerHTML') {
          initValue = $.html(node)
        } else if (firstFilterName === 'node') {
          initValue = cheerio(node)
        } else {
          // `text` is the default filter
          initValue = node.text()
        }
        // Remove the first special filter.
        const normalFilterList = SPECIAL_FILTER_NAMES.includes(firstFilterName)
          ? filterList.slice(1)
          : filterList
        result.add(name, initValue, normalFilterList)
      } else if (part.type === 'assignment') {
        const {
          capture: { name, filterList },
          value,
        } = part
        result.forceAdd(name, value, filterList)
      } else {
        // part.type === 'call'
        const { funcName, args } = part
        contentFunctions.get(funcName)(result, node, args)
      }
    }
    return result
  }
}
