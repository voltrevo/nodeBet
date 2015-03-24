function observable(value)
{
    var self = this;
    
    this.value = value;
    this.listeners = [];

    this.get = function() { return self.value; }
    
    this.set = function(new_value)
    {
        var old_value = self.value;
        self.value = new_value;

        for (var i in self.listeners)
        {
            self.listeners[i](self.value, old_value);
        }
    }

    this.listen = function(listener) { self.listeners.push(listener); }
}
