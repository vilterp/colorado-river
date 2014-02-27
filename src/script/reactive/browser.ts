module Reactive.Browser {

    export function from_event(emitter : HTMLElement, event_name : string) : Stream<any> {
        var controller = new StreamController();
        emitter.addEventListener(event_name, (evt) => controller.add(evt));
        return controller.stream;
    }

    export function bind_value(signal : Signal<any>, element : HTMLElement, attr_name : string) {
        element[attr_name] = signal.value;
        signal.updates.listen(
            (value) => { element[attr_name] = value; }
        )
    }

    export module HTTP {

        export interface HTTPResponse {
            status_code : number;
            body : string;
        }

        // TODO: this should really return an Either.
        export function get(url : string) : Future<string> {
            var comp = new Completer<string>();
            var req = new XMLHttpRequest();
            req.addEventListener('error', (err) => comp.error(err));
            req.addEventListener('abort', (err) => comp.error(err));
            req.addEventListener('timeout', (err) => comp.error(err));
            req.addEventListener('load', () => {
                if(req.status == 200) {
                    comp.complete(req.responseText);
                } else {
                    comp.error({
                        status_code: req.status,
                        body: req.responseText
                    });
                }
            });
            req.open('get', url);
            req.send();
            return comp.future;
        }

    }

}

/* TODO
class ElemDimensions extends EventStream {
    constructor(public elem) {
        super();
        this.value = this.get_dimensions();
        EventStream.from_event(window, "resize").observe((evt) => this.trigger_event(this.get_dimensions()));
    }

    public get_dimensions() {
        return {
            width: this.elem.offsetWidth,
            height: this.elem.offsetHeight
        };
    }
}
*/