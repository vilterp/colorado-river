var Reactive;
(function (Reactive) {
    var Browser;
    (function (Browser) {
        function from_event(emitter, event_name) {
            var controller = new Reactive.StreamController();
            emitter.addEventListener(event_name, function (evt) { return controller.add(evt); });
            return controller.stream;
        }
        Browser.from_event = from_event;
        function bind_to_attribute(signal, element, attr_name) {
            element.setAttribute(attr_name, signal.value);
            signal.updates.listen(function (value) { element.setAttribute(attr_name, signal.value); });
        }
        Browser.bind_to_attribute = bind_to_attribute;
        function bind_to_innerText(element, text) {
            element.innerText = text.value;
            text.updates.listen(function (value) { return element.innerText = value; });
        }
        Browser.bind_to_innerText = bind_to_innerText;
        function mouse_pos(element) {
            var controller = new Reactive.SignalController({ x: 0, y: 0 });
            element.addEventListener('mousemove', function (evt) {
                controller.update({ x: evt.offsetX, y: evt.offsetY });
            });
            return controller.signal;
        }
        Browser.mouse_pos = mouse_pos;
        var HTTP;
        (function (HTTP) {
            // TODO: this should really return an Either.
            function get(url) {
                var comp = new Reactive.Completer();
                var req = new XMLHttpRequest();
                req.addEventListener('error', function (err) { return comp.error(err); });
                req.addEventListener('abort', function (err) { return comp.error(err); });
                req.addEventListener('timeout', function (err) { return comp.error(err); });
                req.addEventListener('load', function () {
                    if (req.status == 200) {
                        comp.complete(req.responseText);
                    }
                    else {
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
            HTTP.get = get;
        })(HTTP = Browser.HTTP || (Browser.HTTP = {}));
    })(Browser = Reactive.Browser || (Reactive.Browser = {}));
})(Reactive || (Reactive = {}));
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
