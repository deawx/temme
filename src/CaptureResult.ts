import invariant from 'invariant'
import { Filter } from './interfaces'
import { FilterFnMap, FilterFn } from './filters'
import { defaultCaptureKey } from './constants'
import { isEmptyObject } from './utils'
import { msg } from './check'

export class CaptureResult {
  private readonly filterFnMap: FilterFnMap
  private readonly result: any = {}
  private failed = false

  constructor(filterFnMap: FilterFnMap) {
    this.filterFnMap = filterFnMap
  }

  setFailed() {
    this.failed = true
  }

  isFailed() {
    return this.failed
  }

  get(key: string) {
    if (this.failed) {
      return null
    }
    return this.result[key]
  }

  add(key: string, value: any, filterList?: Filter[]) {
    if (this.failed) {
      return
    }
    if (filterList) {
      value = this.applyFilterList(value, filterList)
    }
    if (value != null && !isEmptyObject(value)) {
      this.result[key] = value
    }
  }

  forceAdd(key: string, value: any, filterList?: Filter[]) {
    if (this.failed) {
      return
    }
    if (filterList) {
      value = this.applyFilterList(value, filterList)
    }
    this.result[key] = value
  }

  merge(other: CaptureResult) {
    if (!other.isFailed()) {
      this.doMerge(other)
    }
  }

  mergeWithFailPropagation(other: CaptureResult) {
    if (other.isFailed()) {
      this.setFailed()
    } else {
      this.doMerge(other)
    }
  }

  getResult() {
    if (this.failed) {
      return null
    }
    let returnVal = this.result
    if (returnVal.hasOwnProperty(defaultCaptureKey)) {
      returnVal = this.result[defaultCaptureKey]
    }
    if (isEmptyObject(returnVal)) {
      returnVal = null
    }
    return returnVal
  }

  private doMerge(other: CaptureResult) {
    const source = other.result
    for (const key of Object.keys(source)) {
      this.result[key] = source[key]
    }
  }

  private applyFilter(value: any, filter: Filter) {
    if (filter.name in this.filterFnMap) {
      const filterFn = this.filterFnMap[filter.name]
      return filterFn.apply(value, filter.args)
    } else if (typeof value[filter.name] === 'function') {
      const filterFn: FilterFn = value[filter.name]
      return filterFn.apply(value, filter.args)
    } else {
      throw new Error(msg.invalidFilter(filter.name))
    }
  }

  private applyFilterList(initValue: any, filterList: Filter[]) {
    return filterList.reduce((value, filter) => {
      if (filter.isArrayFilter) {
        invariant(Array.isArray(value), msg.arrayFilterAppliedToNonArrayValue(filter.name))
        return value.map((item: any) => this.applyFilter(item, filter))
      } else {
        return this.applyFilter(value, filter)
      }
    }, initValue)
  }
}
