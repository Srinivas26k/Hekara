import { Show } from "solid-js";

export function Pager(props: { total: number; limit: number; offset: number; onPage: (offset: number) => void }) {
  const from = () => (props.total === 0 ? 0 : props.offset + 1);
  const to = () => Math.min(props.offset + props.limit, props.total);
  return (
    <div class="pager">
      <span>
        {from()}–{to()} of {props.total}
      </span>
      <Show when={props.total > props.limit}>
        <div>
          <button
            class="ghost"
            disabled={props.offset === 0}
            onClick={() => props.onPage(Math.max(0, props.offset - props.limit))}
          >
            Previous
          </button>
          <button
            class="ghost"
            disabled={props.offset + props.limit >= props.total}
            onClick={() => props.onPage(props.offset + props.limit)}
          >
            Next
          </button>
        </div>
      </Show>
    </div>
  );
}
