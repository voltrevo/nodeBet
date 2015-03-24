"use strict";

function insert_after(reference_node, new_node)
{
    reference_node.parentNode.insertBefore(new_node, reference_node.nextSibling);
}
