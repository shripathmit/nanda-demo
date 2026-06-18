"use client";

// Max-heap keyed by numeric score.
// Used by adaptiveRoute() to extract the best provider in O(log n).

interface HeapNode<T> {
  item: T;
  score: number;
}

export class MaxHeap<T> {
  private data: HeapNode<T>[] = [];

  get size(): number {
    return this.data.length;
  }

  /** O(log n) */
  insert(item: T, score: number): void {
    this.data.push({ item, score });
    this.siftUp(this.data.length - 1);
  }

  /** O(log n) */
  extractMax(): { item: T; score: number } | null {
    if (this.data.length === 0) return null;
    const max = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return max;
  }

  peekMax(): { item: T; score: number } | null {
    return this.data[0] ?? null;
  }

  /** Return all items sorted descending by score (non-destructive) */
  toSortedArray(): Array<{ item: T; score: number }> {
    const copy = new MaxHeap<T>();
    copy.data = [...this.data];
    const result: Array<{ item: T; score: number }> = [];
    while (copy.size > 0) {
      const node = copy.extractMax();
      if (node) result.push(node);
    }
    return result;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.data[parent].score >= this.data[i].score) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let largest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l].score > this.data[largest].score) largest = l;
      if (r < n && this.data[r].score > this.data[largest].score) largest = r;
      if (largest === i) break;
      [this.data[largest], this.data[i]] = [this.data[i], this.data[largest]];
      i = largest;
    }
  }
}
