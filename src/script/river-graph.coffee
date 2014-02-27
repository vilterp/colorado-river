class Coordinates

  constructor: (@lat, @lon) ->

class Graph


class Node

  # [Edge], [Edge], Coordinates
  constructor: (@incoming, @outgoing, @coordinates) ->


class Edge

  # Node, Node
  constructor: (@from, @to) ->

