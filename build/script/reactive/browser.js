var Reactive;
(function (Reactive) {
    (function (Browser) {
        function from_event(emitter, event_name) {
            var controller = new Reactive.StreamController();
            emitter.addEventListener(event_name, function (evt) {
                return controller.add(evt);
            });
            return controller.stream;
        }
        Browser.from_event = from_event;

        function bind_value(signal, element, attr_name) {
            element[attr_name] = signal.value;
            signal.updates.listen(function (value) {
                element[attr_name] = value;
            });
        }
        Browser.bind_value = bind_value;

        (function (HTTP) {
            // TODO: this should really return an Either.
            function get(url) {
                var comp = new Reactive.Completer();
                var req = new XMLHttpRequest();
                req.addEventListener('error', function (err) {
                    return comp.error(err);
                });
                req.addEventListener('abort', function (err) {
                    return comp.error(err);
                });
                req.addEventListener('timeout', function (err) {
                    return comp.error(err);
                });
                req.addEventListener('load', function () {
                    if (req.status == 200) {
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
            HTTP.get = get;
        })(Browser.HTTP || (Browser.HTTP = {}));
        var HTTP = Browser.HTTP;
    })(Reactive.Browser || (Reactive.Browser = {}));
    var Browser = Reactive.Browser;
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
